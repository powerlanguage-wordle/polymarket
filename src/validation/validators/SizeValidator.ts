import { createLogger } from '../../utils/logger';
import type { Trade, Config } from '../../types';

const logger = createLogger('SizeValidator');

export class SizeValidator {
  private minTradeSize: number;

  constructor(config: Config) {
    this.minTradeSize = config.riskParams.minTradeSize;
  }

  validate(trade: Trade, positionSize?: number): { valid: boolean; reason?: string } {
    // If positionSize is provided, validate it instead of the original trade size
    // This ensures we're checking OUR calculated size, not the tracked trader's size
    const sizeToCheck = positionSize !== undefined ? positionSize : trade.size;
    const priceToUse = trade.price;

    // Check for invalid price
    if (priceToUse <= 0) {
      logger.debug('Trade price invalid or unavailable', {
        tradeId: trade.id,
        price: priceToUse,
      });

      return {
        valid: false,
        reason: 'Current price unavailable',
      };
    }

    const tradeValue = sizeToCheck * priceToUse;

    if (sizeToCheck < this.minTradeSize) {
      logger.debug('Position size below threshold', {
        tradeId: trade.id,
        positionSize: sizeToCheck,
        minSize: this.minTradeSize,
      });

      return {
        valid: false,
        reason: `Trade size ${sizeToCheck.toFixed(2)} is below minimum ${this.minTradeSize}`,
      };
    }

    if (tradeValue < this.minTradeSize * 0.5) {
      logger.debug('Trade value below threshold', {
        tradeId: trade.id,
        value: tradeValue,
        minValue: this.minTradeSize * 0.5,
      });

      return {
        valid: false,
        reason: `Trade value ${tradeValue.toFixed(2)} is below minimum ${(this.minTradeSize * 0.5).toFixed(2)}`,
      };
    }

    return { valid: true };
  }
}
