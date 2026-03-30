import { createLogger } from '../utils/logger';
import type { Trade } from '../types';

const logger = createLogger('TradeNormalizer');

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

export class TradeNormalizer {
  normalize(rawTrade: RawPolymarketTrade): Trade | null {
    try {
      // Data already comes in the correct format from data-api
      const price = rawTrade.price;
      const size = rawTrade.size;
      const side = this.parseSide(rawTrade.side);

      if (price === undefined || size === undefined || side === null) {
        logger.warn('Failed to parse trade data', { tradeData: rawTrade });
        return null;
      }

      // Generate a unique ID from transaction hash and timestamp
      const id = rawTrade.transactionHash || `${rawTrade.conditionId}-${rawTrade.timestamp}`;

      const trade: Trade = {
        id,
        trader: rawTrade.proxyWallet.toLowerCase(),
        market: rawTrade.conditionId,
        asset: rawTrade.asset,
        outcome: rawTrade.outcome || 'unknown',
        side,
        price,
        size,
        timestamp: rawTrade.timestamp,
        transactionHash: rawTrade.transactionHash,
      };

      return trade;
    } catch (error) {
      logger.error('Error normalizing trade', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private parseSide(side: string): 'BUY' | 'SELL' | null {
    const normalized = side.toUpperCase();
    if (normalized === 'BUY' || normalized === 'SELL') {
      return normalized as 'BUY' | 'SELL';
    }
    logger.warn('Invalid side value', { side });
    return null;
  }
}
