import { createLogger } from '../utils/logger';
import type { Trade, Config } from '../types';

const logger = createLogger('PositionSizer');

export class PositionSizer {
  constructor(_config: Config) {
    // Config reserved for future use
  }

  calculatePositionSize(
    trade: Trade,
    allocatedCapital: number,
    mode: 'fixed' | 'proportional' = 'fixed'
  ): number {
    if (allocatedCapital <= 0) {
      logger.warn('No capital allocated for position', { tradeId: trade.id });
      return 0;
    }

    if (trade.price <= 0) {
      logger.error('Invalid trade price', { tradeId: trade.id, price: trade.price });
      return 0;
    }

    let positionSize: number;

    if (mode === 'fixed') {
      positionSize = allocatedCapital / trade.price;
    } else {
      const proportionalFactor = 0.1;
      positionSize = trade.size * proportionalFactor;

      const maxSize = allocatedCapital / trade.price;
      positionSize = Math.min(positionSize, maxSize);
    }

    positionSize = this.roundToValidIncrement(positionSize);

    logger.debug('Position size calculated', {
      tradeId: trade.id,
      mode,
      allocatedCapital: allocatedCapital.toFixed(2),
      price: trade.price,
      positionSize: positionSize.toFixed(2),
    });

    return positionSize;
  }

  private roundToValidIncrement(size: number): number {
    const increment = 0.01;
    return Math.floor(size / increment) * increment;
  }

  calculateOrderValue(size: number, price: number): number {
    return size * price;
  }
}
