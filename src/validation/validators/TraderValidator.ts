import { createLogger } from '../../utils/logger';
import type { Config } from '../../types';

const logger = createLogger('TraderValidator');

export class TraderValidator {
  private trackedTraders: Set<string>;

  constructor(config: Config) {
    this.trackedTraders = new Set(config.trackedTraders.map((addr) => addr.toLowerCase()));
  }

  isWhitelisted(traderAddress: string): boolean {
    const normalized = traderAddress.toLowerCase();
    const isWhitelisted = this.trackedTraders.has(normalized);

    if (!isWhitelisted) {
      logger.debug('Trader not in whitelist', { trader: normalized });
    }

    return isWhitelisted;
  }

  validate(traderAddress: string): { valid: boolean; reason?: string } {
    const isWhitelisted = this.isWhitelisted(traderAddress);

    if (!isWhitelisted) {
      return {
        valid: false,
        reason: `Trader ${traderAddress} is not in the tracked traders list`,
      };
    }

    return { valid: true };
  }
}
