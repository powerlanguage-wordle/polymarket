import { createLogger } from '../../utils/logger';
import type { Trade, Config } from '../../types';

const logger = createLogger('SizeValidator');

export class SizeValidator {
  private minTradeSize: number;

  constructor(config: Config) {
    this.minTradeSize = config.riskParams.minTradeSize;
  }

  validate(trade: Trade): { valid: boolean; reason?: string } {
    const tradeValue = trade.size * trade.price;

    if (trade.size < this.minTradeSize) {
      logger.debug('Trade size below threshold', {
        tradeId: trade.id,
        size: trade.size,
        minSize: this.minTradeSize,
      });

      return {
        valid: false,
        reason: `Trade size ${trade.size} is below minimum ${this.minTradeSize}`,
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
