import { createLogger } from '../utils/logger';
import type { Trade } from '../types';

const logger = createLogger('TradeAggregator');

interface PendingTrade {
  trade: Trade;
  expiresAt: number;
}

/**
 * Aggregates multiple partial fills of the same order into a single trade
 * Groups trades by: trader + market + outcome + side within a time window
 */
export class TradeAggregator {
  private pendingTrades: Map<string, PendingTrade[]> = new Map();
  private aggregationWindowMs: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(aggregationWindowMs: number = 30000) {
    this.aggregationWindowMs = aggregationWindowMs;
    
    // Cleanup expired pending trades every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTrades();
    }, 10000);
  }

  /**
   * Add a trade to the aggregation pool
   * Returns the aggregated trade if the window has expired, otherwise null
   */
  addTrade(trade: Trade): Trade | null {
    const groupKey = this.getGroupKey(trade);
    const now = Date.now();
    const expiresAt = now + this.aggregationWindowMs;

    // Get or create pending trades for this group
    let pending = this.pendingTrades.get(groupKey);
    
    if (!pending) {
      pending = [];
      this.pendingTrades.set(groupKey, pending);
    }

    // Check if we already have trades for this group
    if (pending.length === 0) {
      // First trade in the group - start the aggregation window
      pending.push({ trade, expiresAt });
      logger.debug('Started aggregation window', {
        groupKey,
        tradeId: trade.id,
        windowMs: this.aggregationWindowMs,
      });
      return null;
    }

    // Add to existing group
    pending.push({ trade, expiresAt });
    
    logger.debug('Added trade to aggregation group', {
      groupKey,
      tradeId: trade.id,
      groupSize: pending.length,
    });

    // Check if the oldest trade in the group has expired
    const oldestExpiresAt = pending[0].expiresAt;
    
    if (now >= oldestExpiresAt) {
      // Window has expired - aggregate and return
      return this.aggregateAndFlush(groupKey);
    }

    return null;
  }

  /**
   * Force flush all pending trades (use on shutdown)
   */
  flushAll(): Trade[] {
    const aggregated: Trade[] = [];
    
    for (const groupKey of this.pendingTrades.keys()) {
      const trade = this.aggregateAndFlush(groupKey);
      if (trade) {
        aggregated.push(trade);
      }
    }

    return aggregated;
  }

  /**
   * Get pending trade count for diagnostics
   */
  getPendingCount(): number {
    let count = 0;
    for (const pending of this.pendingTrades.values()) {
      count += pending.length;
    }
    return count;
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private getGroupKey(trade: Trade): string {
    // Group by: trader + market + outcome + side
    return `${trade.trader}:${trade.market}:${trade.outcome}:${trade.side}`;
  }

  private aggregateAndFlush(groupKey: string): Trade | null {
    const pending = this.pendingTrades.get(groupKey);
    
    if (!pending || pending.length === 0) {
      return null;
    }

    // Remove from pending
    this.pendingTrades.delete(groupKey);

    if (pending.length === 1) {
      // Only one trade - no aggregation needed
      logger.debug('No aggregation needed (single trade)', {
        groupKey,
        tradeId: pending[0].trade.id,
      });
      return pending[0].trade;
    }

    // Aggregate multiple trades
    const trades = pending.map(p => p.trade);
    const aggregated = this.aggregateTrades(trades);

    logger.info('Aggregated multiple trades', {
      groupKey,
      originalCount: trades.length,
      originalSizes: trades.map(t => t.size),
      originalPrices: trades.map(t => t.price),
      aggregatedSize: aggregated.size,
      aggregatedPrice: aggregated.price,
    });

    return aggregated;
  }

  private aggregateTrades(trades: Trade[]): Trade {
    if (trades.length === 0) {
      throw new Error('Cannot aggregate empty trade array');
    }

    if (trades.length === 1) {
      return trades[0];
    }

    // Calculate total size and weighted average price
    let totalSize = 0;
    let totalValue = 0;

    for (const trade of trades) {
      totalSize += trade.size;
      totalValue += trade.size * trade.price;
    }

    const weightedAvgPrice = totalValue / totalSize;

    // Use the most recent trade's timestamp and first trade's ID
    const mostRecentTrade = trades.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    // Create aggregated trade with combined IDs for traceability
    const aggregatedId = trades.length > 3 
      ? `${trades[0].id}+${trades.length - 1}more`
      : trades.map(t => t.id).join('+');

    return {
      ...mostRecentTrade,
      id: aggregatedId,
      size: totalSize,
      price: weightedAvgPrice,
    };
  }

  private cleanupExpiredTrades(): void {
    const now = Date.now();
    const expiredGroups: string[] = [];

    for (const [groupKey, pending] of this.pendingTrades.entries()) {
      if (pending.length > 0 && now >= pending[0].expiresAt) {
        expiredGroups.push(groupKey);
      }
    }

    if (expiredGroups.length > 0) {
      logger.debug('Cleaning up expired trade groups', {
        count: expiredGroups.length,
      });

      for (const groupKey of expiredGroups) {
        this.aggregateAndFlush(groupKey);
      }
    }
  }
}
