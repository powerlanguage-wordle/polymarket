import { createLogger } from '../../utils/logger';
import type { Trade, Config } from '../../types';

const logger = createLogger('SlippageValidator');

export class SlippageValidator {
  private maxSlippage: number;
  private config: Config;

  constructor(config: Config) {
    this.maxSlippage = config.riskParams.maxSlippage;
    this.config = config;
  }

  async validate(trade: Trade): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Use trade.asset (token ID) not trade.outcome ("Yes"/"No")
      const tokenId = trade.asset || trade.outcome;
      const currentPrice = await this.fetchCurrentPrice(trade.market, tokenId);

      if (currentPrice === null) {
        logger.warn('Could not fetch current price', {
          market: trade.market,
          tokenId,
          outcome: trade.outcome,
        });

        return {
          valid: false,
          reason: 'Current price unavailable',
        };
      }

      const slippage = Math.abs(currentPrice - trade.price) / trade.price;

      if (slippage > this.maxSlippage) {
        logger.debug('Slippage too high', {
          tradeId: trade.id,
          originalPrice: trade.price,
          currentPrice,
          slippage: (slippage * 100).toFixed(2) + '%',
          maxSlippage: (this.maxSlippage * 100).toFixed(2) + '%',
        });

        return {
          valid: false,
          reason: `Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(this.maxSlippage * 100).toFixed(2)}%`,
        };
      }

      logger.debug('Slippage check passed', {
        tradeId: trade.id,
        slippage: (slippage * 100).toFixed(2) + '%',
      });

      return { valid: true };
    } catch (error) {
      logger.error('Error checking slippage', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        reason: 'Error checking slippage',
      };
    }
  }

  private async fetchCurrentPrice(market: string, tokenId: string): Promise<number | null> {
    try {
      const url = `${this.config.polymarket.clobApiUrl}/midpoint?token_id=${tokenId}`;

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
      const midpoint = parseFloat(data.mid);

      if (isNaN(midpoint)) {
        return null;
      }

      return midpoint;
    } catch (error) {
      logger.error('Failed to fetch current price', {
        market,
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
