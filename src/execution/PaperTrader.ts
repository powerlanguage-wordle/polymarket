import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import type { Trade, ExecutionResult, Position } from '../types';

const logger = createLogger('PaperTrader');

export class PaperTrader {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async executeTrade(trade: Trade, positionSize: number): Promise<ExecutionResult> {
    logger.info('Simulating trade execution (paper trading)', {
      tradeId: trade.id,
      market: trade.market,
      side: trade.side,
      size: positionSize,
      price: trade.price,
    });

    const simulatedOrderId = `PAPER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const positionId = `POS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const position: Position = {
      id: positionId,
      market: trade.market,
      outcome: trade.outcome,
      side: trade.side,
      size: positionSize,
      entryPrice: trade.price,
      currentPrice: trade.price,
      pnl: 0,
      status: 'open',
      openedAt: Date.now(),
      originalTrader: trade.trader,
    };

    try {
      await this.db.savePosition(position);

      await this.db.saveExecutionLog(
        trade.id,
        true,
        positionId,
        simulatedOrderId,
        trade.price,
        positionSize
      );

      logger.info('Paper trade executed successfully', {
        orderId: simulatedOrderId,
        positionId,
        value: (positionSize * trade.price).toFixed(2),
      });

      return {
        success: true,
        orderId: simulatedOrderId,
        positionId,
        executedPrice: trade.price,
        executedSize: positionSize,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Error saving paper trade', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: 'Failed to save paper trade to database',
        timestamp: Date.now(),
      };
    }
  }
}
