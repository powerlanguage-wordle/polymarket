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
      const orderBook = await this.fetchOrderBook(trade.market, trade.outcome);

      if (!orderBook) {
        logger.warn('Could not fetch order book', {
          market: trade.market,
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
    outcome: string
  ): Promise<OrderBookSnapshot | null> {
    try {
      const url = `${this.config.polymarket.clobApiUrl}/book?token_id=${outcome}`;

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
        outcome,
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
        outcome,
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
