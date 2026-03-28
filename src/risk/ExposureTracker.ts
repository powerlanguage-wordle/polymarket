import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import type { Config } from '../types';

const logger = createLogger('ExposureTracker');

export class ExposureTracker {
  private config: Config;
  private db: DatabaseManager;

  constructor(config: Config, db: DatabaseManager) {
    this.config = config;
    this.db = db;
  }

  getMarketExposure(market: string): number {
    const exposure = this.db.getTotalMarketExposure(market);
    logger.debug('Market exposure', { market, exposure: exposure.toFixed(2) });
    return exposure;
  }

  canAddExposure(market: string, additionalExposure: number, totalCapital: number): boolean {
    const currentExposure = this.getMarketExposure(market);
    const totalExposure = currentExposure + additionalExposure;
    const maxExposure = totalCapital * this.config.riskParams.maxMarketExposure;

    const canAdd = totalExposure <= maxExposure;

    if (!canAdd) {
      logger.warn('Market exposure limit reached', {
        market,
        currentExposure: currentExposure.toFixed(2),
        additionalExposure: additionalExposure.toFixed(2),
        totalExposure: totalExposure.toFixed(2),
        maxExposure: maxExposure.toFixed(2),
      });
    }

    return canAdd;
  }

  getTotalExposure(): number {
    const openPositions = this.db.getOpenPositions();
    const totalExposure = openPositions.reduce((sum, pos) => {
      return sum + pos.size * pos.entryPrice;
    }, 0);

    return totalExposure;
  }

  getExposureByMarket(): Map<string, number> {
    const openPositions = this.db.getOpenPositions();
    const exposureMap = new Map<string, number>();

    for (const position of openPositions) {
      const current = exposureMap.get(position.market) || 0;
      exposureMap.set(position.market, current + position.size * position.entryPrice);
    }

    return exposureMap;
  }
}
