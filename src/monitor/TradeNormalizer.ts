import { createLogger } from '../utils/logger';
import type { Trade } from '../types';

const logger = createLogger('TradeNormalizer');

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

export class TradeNormalizer {
  normalize(rawTrade: RawPolymarketTrade): Trade | null {
    try {
      const price = this.parsePrice(rawTrade.price);
      const size = this.parseSize(rawTrade.size);
      const side = this.parseSide(rawTrade.side);

      if (price === null || size === null || side === null) {
        logger.warn('Failed to parse trade data', { tradeId: rawTrade.id });
        return null;
      }

      const trade: Trade = {
        id: rawTrade.id,
        trader: rawTrade.maker_address.toLowerCase(),
        market: rawTrade.market,
        outcome: rawTrade.asset_id || rawTrade.outcome || 'unknown',
        side,
        price,
        size,
        timestamp: this.parseTimestamp(rawTrade.timestamp),
        transactionHash: rawTrade.transaction_hash,
      };

      return trade;
    } catch (error) {
      logger.error('Error normalizing trade', {
        tradeId: rawTrade.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private parsePrice(priceStr: string): number | null {
    try {
      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0 || price > 1) {
        logger.warn('Invalid price value', { price: priceStr });
        return null;
      }
      return price;
    } catch {
      return null;
    }
  }

  private parseSize(sizeStr: string): number | null {
    try {
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) {
        logger.warn('Invalid size value', { size: sizeStr });
        return null;
      }
      return size;
    } catch {
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

  private parseTimestamp(timestamp: number): number {
    if (timestamp > 1e12) {
      return Math.floor(timestamp / 1000);
    }
    return timestamp;
  }
}
