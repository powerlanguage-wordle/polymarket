import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { TradeNormalizer } from './TradeNormalizer';
import { PolymarketClient } from '../execution/PolymarketClient';
import type { Config } from '../types';

const logger = createLogger('TradeMonitor');

interface RawPolymarketTrade {
  id: string;
  market: string;
  asset_id: string;
  maker_address: string;
  side: string;
  price: string;
  size: string;
  timestamp: number;
  transaction_hash?: string;
  outcome?: string;
}

export class TradeMonitor extends EventEmitter {
  private cache: LRUCache<string, boolean>;
  private normalizer: TradeNormalizer;
  private config: Config;
  private client: PolymarketClient;
  private isRunning: boolean = false;
  private pollIntervalId?: NodeJS.Timeout;

  constructor(config: Config, client: PolymarketClient) {
    super();
    this.config = config;
    this.client = client;
    this.cache = new LRUCache<string, boolean>({
      max: 1000,
      ttl: 1000 * 60 * 60,
    });
    this.normalizer = new TradeNormalizer();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trade monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting trade monitor', {
      trackedTraders: this.config.trackedTraders.length,
      pollInterval: this.config.execution.pollInterval,
    });

    await this.poll();

    this.pollIntervalId = setInterval(() => {
      this.poll().catch((error) => {
        logger.error('Error in poll cycle', { error: error.message });
      });
    }, this.config.execution.pollInterval);
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

    logger.info('Trade monitor stopped');
  }

  private async poll(): Promise<void> {
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
        if (this.isDuplicate(rawTrade.id)) {
          continue;
        }

        const normalizedTrade = this.normalizer.normalize(rawTrade);

        if (normalizedTrade) {
          this.cache.set(rawTrade.id, true);
          this.emit('newTrade', normalizedTrade);
          logger.info('New trade detected', {
            tradeId: normalizedTrade.id,
            trader: normalizedTrade.trader,
            market: normalizedTrade.market,
            side: normalizedTrade.side,
            size: normalizedTrade.size,
            price: normalizedTrade.price,
          });
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
}
