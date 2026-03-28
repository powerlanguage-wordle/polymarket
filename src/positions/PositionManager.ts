import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import type { Position } from '../types';

const logger = createLogger('PositionManager');

export class PositionManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  getOpenPositions(): Position[] {
    return this.db.getOpenPositions();
  }

  getPositionsByMarket(market: string): Position[] {
    return this.db.getPositionsByMarket(market);
  }

  updatePosition(positionId: string, currentPrice: number): void {
    const positions = this.db.getOpenPositions();
    const position = positions.find((p) => p.id === positionId);

    if (!position) {
      logger.warn('Position not found', { positionId });
      return;
    }

    const priceDiff = currentPrice - position.entryPrice;
    const pnl = position.side === 'BUY' ? priceDiff * position.size : -priceDiff * position.size;

    this.db.updatePosition(positionId, {
      currentPrice,
      pnl,
    });

    logger.debug('Position updated', {
      positionId,
      currentPrice,
      pnl: pnl.toFixed(2),
    });
  }

  closePosition(positionId: string, exitPrice: number): void {
    const positions = this.db.getOpenPositions();
    const position = positions.find((p) => p.id === positionId);

    if (!position) {
      logger.warn('Position not found', { positionId });
      return;
    }

    const priceDiff = exitPrice - position.entryPrice;
    const pnl = position.side === 'BUY' ? priceDiff * position.size : -priceDiff * position.size;

    this.db.updatePosition(positionId, {
      status: 'closed',
      currentPrice: exitPrice,
      pnl,
      closedAt: Date.now(),
    });

    logger.info('Position closed', {
      positionId,
      exitPrice,
      pnl: pnl.toFixed(2),
    });
  }

  getPortfolioSummary(): {
    totalPositions: number;
    totalValue: number;
    totalPnl: number;
    positions: Position[];
  } {
    const positions = this.getOpenPositions();

    const totalValue = positions.reduce((sum, pos) => {
      return sum + pos.size * pos.entryPrice;
    }, 0);

    const totalPnl = positions.reduce((sum, pos) => {
      return sum + (pos.pnl || 0);
    }, 0);

    return {
      totalPositions: positions.length,
      totalValue,
      totalPnl,
      positions,
    };
  }
}
