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

    if (this.config.execution.useWebSocket) {
      console.log(`🔌 Starting trade monitor with WebSocket for ${this.config.trackedTraders.length} traders...`);
      logger.info('Starting trade monitor with WebSocket', {
        trackedTraders: this.config.trackedTraders.length,
      });
      this.startWebSocketMonitoring();
    } else {
      console.log(`🔄 Starting trade monitor with POLLING (${this.config.execution.pollInterval}ms) for ${this.config.trackedTraders.length} traders...`);
      logger.info('Starting trade monitor with polling', {
        trackedTraders: this.config.trackedTraders.length,
        pollInterval: this.config.execution.pollInterval,
      });
      this.startPollingMonitoring();
    }
  }

  private startWebSocketMonitoring(): void {
    // Listen to WebSocket trade events
    this.client.on('trade', (rawTrade: any) => {
      this.handleWebSocketTrade(rawTrade);
    });

    // Handle WebSocket connection events
    this.client.on('connected', () => {
      logger.info('WebSocket connected, subscribing to traders');
      // Subscribe to all tracked traders
      for (const traderAddress of this.config.trackedTraders) {
        this.client.subscribeToTrader(traderAddress);
      }
    });

    this.client.on('disconnected', () => {
      logger.error('WebSocket disconnected and unable to reconnect');
      // Fall back to polling
      logger.info('Falling back to polling mode');
      this.startPollingMonitoring();
    });

    // Connect the WebSocket
    this.client.connectWebSocket();
  }

  private startPollingMonitoring(): void {
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
  }

  private handleWebSocketTrade(rawTrade: any): void {
    if (this.isDuplicate(rawTrade.id)) {
      return;
    }

    const normalizedTrade = this.normalizer.normalize(rawTrade);

    if (normalizedTrade) {
      this.cache.set(rawTrade.id, true);
      this.emit('newTrade', normalizedTrade);
      console.log(`🔔 NEW TRADE DETECTED (WebSocket): ${normalizedTrade.trader.substring(0, 10)}... | ${normalizedTrade.market} | ${normalizedTrade.side} ${normalizedTrade.size} @ $${normalizedTrade.price}`);
      logger.info('New trade detected via WebSocket', {
        tradeId: normalizedTrade.id,
        trader: normalizedTrade.trader,
        market: normalizedTrade.market,
        side: normalizedTrade.side,
        size: normalizedTrade.size,
        price: normalizedTrade.price,
      });
    }
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop polling if active
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = undefined;
    }

    // Disconnect WebSocket if active
    if (this.config.execution.useWebSocket) {
      this.client.removeAllListeners('trade');
      this.client.removeAllListeners('connected');
      this.client.removeAllListeners('disconnected');
      this.client.disconnectWebSocket();
    }

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
        if (this.isDuplicate(rawTrade.id)) {
          continue;
        }

        const normalizedTrade = this.normalizer.normalize(rawTrade);

        if (normalizedTrade) {
          this.cache.set(rawTrade.id, true);
          this.emit('newTrade', normalizedTrade);
          console.log(`🔔 NEW TRADE DETECTED (Polling): ${normalizedTrade.trader.substring(0, 10)}... | ${normalizedTrade.market} | ${normalizedTrade.side} ${normalizedTrade.size} @ $${normalizedTrade.price}`);
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
