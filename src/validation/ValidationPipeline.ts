import { createLogger } from '../utils/logger';
import { TraderValidator } from './validators/TraderValidator';
import { SizeValidator } from './validators/SizeValidator';
import { LiquidityChecker } from './validators/LiquidityChecker';
import { SlippageValidator } from './validators/SlippageValidator';
import type { Trade, Config, ValidationResult } from '../types';

const logger = createLogger('ValidationPipeline');

export class ValidationPipeline {
  private traderValidator: TraderValidator;
  private sizeValidator: SizeValidator;
  private liquidityChecker: LiquidityChecker;
  private slippageValidator: SlippageValidator;

  constructor(config: Config) {
    this.traderValidator = new TraderValidator(config);
    this.sizeValidator = new SizeValidator(config);
    this.liquidityChecker = new LiquidityChecker(config);
    this.slippageValidator = new SlippageValidator(config);
  }

  async shouldCopyTrade(trade: Trade, positionSize?: number): Promise<ValidationResult> {
    const checks = {
      traderWhitelisted: false,
      sizeThreshold: false,
      liquidity: false,
      slippage: false,
      riskLimits: true,
    };

    const traderCheck = this.traderValidator.validate(trade.trader);
    checks.traderWhitelisted = traderCheck.valid;
    if (!traderCheck.valid) {
      logger.info('Trade rejected: trader not whitelisted', {
        tradeId: trade.id,
        trader: trade.trader,
      });
      return {
        shouldCopy: false,
        reason: traderCheck.reason,
        checks,
      };
    }

    const sizeCheck = this.sizeValidator.validate(trade, positionSize);
    checks.sizeThreshold = sizeCheck.valid;
    if (!sizeCheck.valid) {
      logger.info('Trade rejected: size threshold', {
        tradeId: trade.id,
        originalSize: trade.size,
        positionSize: positionSize,
      });
      return {
        shouldCopy: false,
        reason: sizeCheck.reason,
        checks,
      };
    }

    const slippageCheck = await this.slippageValidator.validate(trade);
    checks.slippage = slippageCheck.valid;
    if (!slippageCheck.valid) {
      logger.info('Trade rejected: slippage too high', {
        tradeId: trade.id,
      });
      return {
        shouldCopy: false,
        reason: slippageCheck.reason,
        checks,
      };
    }

    if (positionSize && positionSize > 0) {
      const liquidityCheck = await this.liquidityChecker.validate(trade, positionSize);
      checks.liquidity = liquidityCheck.valid;
      if (!liquidityCheck.valid) {
        logger.info('Trade rejected: insufficient liquidity', {
          tradeId: trade.id,
          positionSize,
        });
        return {
          shouldCopy: false,
          reason: liquidityCheck.reason,
          checks,
        };
      }
    } else {
      checks.liquidity = true;
    }

    logger.info('Trade passed all validation checks', {
      tradeId: trade.id,
      trader: trade.trader,
      market: trade.market,
    });

    return {
      shouldCopy: true,
      checks,
    };
  }
}
