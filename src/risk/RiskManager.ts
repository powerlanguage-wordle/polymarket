import { createLogger } from '../utils/logger';
import { CapitalCalculator } from './CapitalCalculator';
import { ExposureTracker } from './ExposureTracker';
import { PositionSizer } from './PositionSizer';
import { DatabaseManager } from '../db/schema';
import type { Trade, Config, RiskLimits } from '../types';

const logger = createLogger('RiskManager');

export class RiskManager {
  private config: Config;
  private db: DatabaseManager;
  private capitalCalculator: CapitalCalculator;
  private exposureTracker: ExposureTracker;
  private positionSizer: PositionSizer;

  constructor(config: Config, db: DatabaseManager, totalCapital: number = 10000) {
    this.config = config;
    this.db = db;
    this.capitalCalculator = new CapitalCalculator(config, db, totalCapital);
    this.exposureTracker = new ExposureTracker(config, db);
    this.positionSizer = new PositionSizer(config);
  }

  canTakeTrade(trade: Trade): RiskLimits {
    const openPositions = this.db.getOpenPositions();

    if (openPositions.length >= this.config.riskParams.maxPositions) {
      logger.warn('Maximum positions limit reached', {
        currentPositions: openPositions.length,
        maxPositions: this.config.riskParams.maxPositions,
      });
      return {
        canTrade: false,
        reason: `Maximum positions (${this.config.riskParams.maxPositions}) already open`,
      };
    }

    const allocatedCapital = this.capitalCalculator.calculateAllocationForTrade();

    if (allocatedCapital <= 0) {
      logger.warn('No capital available for trading', { tradeId: trade.id });
      return {
        canTrade: false,
        reason: 'Insufficient capital available',
      };
    }

    const positionSize = this.positionSizer.calculatePositionSize(trade, allocatedCapital);

    if (positionSize <= 0) {
      logger.warn('Calculated position size is zero', { tradeId: trade.id });
      return {
        canTrade: false,
        reason: 'Position size too small',
      };
    }

    const orderValue = positionSize * trade.price;
    const totalCapital = this.capitalCalculator.getTotalCapital();

    const canAddExposure = this.exposureTracker.canAddExposure(trade.market, orderValue, totalCapital);

    if (!canAddExposure) {
      logger.warn('Market exposure limit would be exceeded', {
        tradeId: trade.id,
        market: trade.market,
      });
      return {
        canTrade: false,
        reason: 'Market exposure limit would be exceeded',
      };
    }

    logger.info('Risk checks passed', {
      tradeId: trade.id,
      allocatedCapital: allocatedCapital.toFixed(2),
      positionSize: positionSize.toFixed(2),
      orderValue: orderValue.toFixed(2),
    });

    return {
      canTrade: true,
      allocatedCapital,
      positionSize,
    };
  }

  calculatePositionSize(trade: Trade): number {
    const allocatedCapital = this.capitalCalculator.calculateAllocationForTrade();
    return this.positionSizer.calculatePositionSize(trade, allocatedCapital);
  }

  getCapitalCalculator(): CapitalCalculator {
    return this.capitalCalculator;
  }

  getExposureTracker(): ExposureTracker {
    return this.exposureTracker;
  }

  getPositionSizer(): PositionSizer {
    return this.positionSizer;
  }
}
