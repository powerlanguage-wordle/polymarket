import { createLogger } from '../../utils/logger';
import type { Trade, Config, OrderBookSnapshot } from '../../types';

const logger = createLogger('LiquidityChecker');

export class LiquidityChecker {
  private config: Config;
  private minLiquidityMultiplier: number = 2.0;

  constructor(config: Config) {
    this.config = config;
  }

  async validate(trade: Trade, positionSize: number): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Use trade.asset (token ID) not trade.outcome ("Yes"/"No")
      const tokenId = trade.asset || trade.outcome;
      const orderBook = await this.fetchOrderBook(trade.market, tokenId);

      if (!orderBook) {
        logger.warn('Could not fetch order book', {
          market: trade.market,
          tokenId,
          outcome: trade.outcome,
        });
        return {
          valid: false,
          reason: 'Order book data unavailable',
        };
      }

      const side = trade.side === 'BUY' ? 'asks' : 'bids';
      const availableLiquidity = this.calculateAvailableLiquidity(orderBook[side], trade.price);

      const requiredLiquidity = positionSize * this.minLiquidityMultiplier;

      if (availableLiquidity < requiredLiquidity) {
        logger.debug('Insufficient liquidity', {
          tradeId: trade.id,
          available: availableLiquidity,
          required: requiredLiquidity,
        });

        return {
          valid: false,
          reason: `Insufficient liquidity: ${availableLiquidity.toFixed(2)} < ${requiredLiquidity.toFixed(2)}`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error checking liquidity', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        reason: 'Error checking liquidity',
      };
    }
  }

  private async fetchOrderBook(
    market: string,
    tokenId: string
  ): Promise<OrderBookSnapshot | null> {
    try {
      const url = `${this.config.polymarket.clobApiUrl}/book?token_id=${tokenId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as any;

      return {
        market,
        outcome: tokenId,
        bids: data.bids?.map((b: { price: string; size: string }) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        })) || [],
        asks: data.asks?.map((a: { price: string; size: string }) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        })) || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to fetch order book', {
        market,
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private calculateAvailableLiquidity(
    orders: Array<{ price: number; size: number }>,
    targetPrice: number
  ): number {
    let totalLiquidity = 0;

    for (const order of orders) {
      if (Math.abs(order.price - targetPrice) <= 0.05) {
        totalLiquidity += order.size;
      }
    }

    return totalLiquidity;
  }
}
