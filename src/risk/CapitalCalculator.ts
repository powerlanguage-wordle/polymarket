import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import type { Config } from '../types';

const logger = createLogger('CapitalCalculator');

export class CapitalCalculator {
  private config: Config;
  private db: DatabaseManager;
  private totalCapital: number;

  constructor(config: Config, db: DatabaseManager, totalCapital: number = 10000) {
    this.config = config;
    this.db = db;
    this.totalCapital = totalCapital;
  }

  async calculateAvailableCapital(): Promise<number> {
    const openPositions = await this.db.getOpenPositions();
    const allocatedCapital = openPositions.reduce((sum, pos) => {
      return sum + pos.size * pos.entryPrice;
    }, 0);

    const availableCapital = this.totalCapital - allocatedCapital;

    logger.debug('Capital calculation', {
      totalCapital: this.totalCapital,
      allocatedCapital: allocatedCapital.toFixed(2),
      availableCapital: availableCapital.toFixed(2),
    });

    return Math.max(0, availableCapital);
  }

  async calculateAllocationForTrade(): Promise<number> {
    const availableCapital = await this.calculateAvailableCapital();
    const maxAllocation = this.totalCapital * this.config.riskParams.maxCapitalPerTrade;

    const allocation = Math.min(availableCapital, maxAllocation);

    logger.debug('Trade allocation calculated', {
      availableCapital: availableCapital.toFixed(2),
      maxAllocation: maxAllocation.toFixed(2),
      allocation: allocation.toFixed(2),
    });

    return allocation;
  }

  setTotalCapital(capital: number): void {
    if (capital <= 0) {
      throw new Error('Total capital must be positive');
    }
    this.totalCapital = capital;
    logger.info('Total capital updated', { totalCapital: capital });
  }

  getTotalCapital(): number {
    return this.totalCapital;
  }
}
