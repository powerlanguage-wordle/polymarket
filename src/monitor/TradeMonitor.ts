import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { TradeNormalizer } from './TradeNormalizer';
import { TradeAggregator } from './TradeAggregator';
import { PolymarketClient } from '../execution/PolymarketClient';
import type { Config, Trade } from '../types';

const logger = createLogger('TradeMonitor');

interface RawPolymarketTrade {
  proxyWallet: string;
  side: string;
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  outcome: string;
  outcomeIndex: number;
  transactionHash?: string;
}

export class TradeMonitor extends EventEmitter {
  private cache: LRUCache<string, boolean>;
  private normalizer: TradeNormalizer;
  private aggregator: TradeAggregator;
  private config: Config;
  private client: PolymarketClient;
  private isRunning: boolean = false;
  private pollIntervalId?: NodeJS.Timeout;
  private flushIntervalId?: NodeJS.Timeout;

  constructor(config: Config, client: PolymarketClient) {
    super();
    this.config = config;
    this.client = client;
    this.cache = new LRUCache<string, boolean>({
      max: 1000,
      ttl: 1000 * 60 * 60,
    });
    this.normalizer = new TradeNormalizer();
    
    // Get aggregation settings from config (default: enabled with 30s window)
    const aggregationEnabled = config.execution.tradeAggregation?.enabled !== false;
    const aggregationWindow = config.execution.tradeAggregation?.windowMs || 30000;
    
    if (aggregationEnabled) {
      this.aggregator = new TradeAggregator(aggregationWindow);
      logger.info('Trade aggregation enabled', { windowMs: aggregationWindow });
    } else {
      // Use 0ms window means no aggregation (immediate passthrough)
      this.aggregator = new TradeAggregator(0);
      logger.info('Trade aggregation disabled');
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trade monitor is already running');
      return;
    }

    this.isRunning = true;

    const aggregationEnabled = this.config.execution.tradeAggregation?.enabled !== false;
    const aggregationWindow = this.config.execution.tradeAggregation?.windowMs || 30000;

    console.log(`🔄 Starting trade monitor with POLLING (${this.config.execution.pollInterval}ms) for ${this.config.trackedTraders.length} traders...`);
    if (aggregationEnabled) {
      console.log(`   📊 Trade aggregation enabled: ${aggregationWindow / 1000}s window`);
    } else {
      console.log(`   📊 Trade aggregation disabled: processing individual trades`);
    }
    
    logger.info('Starting trade monitor with polling', {
      trackedTraders: this.config.trackedTraders.length,
      pollInterval: this.config.execution.pollInterval,
      aggregationEnabled,
      aggregationWindow: aggregationEnabled ? `${aggregationWindow / 1000}s` : 'disabled',
    });

    // Initial poll
    this.poll().catch((error) => {
      logger.error('Error in initial poll', { error: error.message });
    });

    // Start polling interval
    this.pollIntervalId = setInterval(() => {
      this.poll().catch((error) => {
        logger.error('Error in poll cycle', { error: error.message });
      });
    }, this.config.execution.pollInterval);

    // Flush aggregated trades every 10 seconds to ensure they're not stuck
    this.flushIntervalId = setInterval(() => {
      this.flushAggregatedTrades();
    }, 10000);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }

    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }

    // Flush any remaining aggregated trades
    this.flushAggregatedTrades();
    this.aggregator.stop();

    logger.info('Trade monitor stopped');
  }

  private async poll(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`🔍 [${timestamp}] Polling for new trades from ${this.config.trackedTraders.length} tracked traders...`);
    logger.debug('Polling for new trades...');

    try {
      for (const traderAddress of this.config.trackedTraders) {
        await this.fetchTradesForTrader(traderAddress);
      }
    } catch (error) {
      logger.error('Error fetching trades', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async fetchTradesForTrader(traderAddress: string): Promise<void> {
    try {
      const recentTrades = await this.getRecentTrades(traderAddress);

      for (const rawTrade of recentTrades) {
        // Generate ID from transaction hash or fallback
        const tradeId = rawTrade.transactionHash || `${rawTrade.conditionId}-${rawTrade.timestamp}`;
        
        if (this.isDuplicate(tradeId)) {
          continue;
        }

        const normalizedTrade = this.normalizer.normalize(rawTrade);

        if (normalizedTrade) {
          this.cache.set(tradeId, true);
          
          // Add to aggregator instead of emitting immediately
          const aggregatedTrade = this.aggregator.addTrade(normalizedTrade);
          
          if (aggregatedTrade) {
            // Aggregation window expired - emit the aggregated trade
            this.emitTrade(aggregatedTrade);
          } else {
            // Trade is pending aggregation
            logger.debug('Trade added to aggregation window', {
              tradeId: normalizedTrade.id,
              pendingCount: this.aggregator.getPendingCount(),
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error fetching trades for trader', {
        trader: traderAddress,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getRecentTrades(makerAddress: string): Promise<RawPolymarketTrade[]> {
    try {
      const trades = await this.client.getTrades(makerAddress, 20);
      return trades;
    } catch (error) {
      logger.error('API request failed', {
        makerAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private isDuplicate(tradeId: string): boolean {
    return this.cache.has(tradeId);
  }

  isTradeProcessed(tradeId: string): boolean {
    return this.cache.has(tradeId);
  }

  private flushAggregatedTrades(): void {
    const aggregatedTrades = this.aggregator.flushAll();
    
    for (const trade of aggregatedTrades) {
      this.emitTrade(trade);
    }

    if (aggregatedTrades.length > 0) {
      logger.debug('Flushed aggregated trades', {
        count: aggregatedTrades.length,
      });
    }
  }

  private emitTrade(trade: Trade): void {
    this.emit('newTrade', trade);
    
    const sizeDisplay = trade.size >= 100 ? trade.size.toFixed(0) : trade.size.toFixed(2);
    const isAggregated = trade.id.includes('+');
    const aggregationIndicator = isAggregated ? '📦 [AGGREGATED] ' : '';
    
    console.log(`🔔 NEW TRADE DETECTED (Polling): ${aggregationIndicator}${trade.trader.substring(0, 10)}... | ${trade.outcome} | ${trade.side} ${sizeDisplay} @ $${trade.price.toFixed(4)}`);
    
    logger.info('New trade detected', {
      tradeId: trade.id,
      trader: trade.trader,
      market: trade.market,
      side: trade.side,
      size: trade.size,
      price: trade.price,
      isAggregated,
    });
  }
}
