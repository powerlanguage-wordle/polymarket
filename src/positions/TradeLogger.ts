import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import type { Trade, ValidationResult, ExecutionResult } from '../types';

const logger = createLogger('TradeLogger');

export class TradeLogger {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async logTrade(trade: Trade): Promise<void> {
    try {
      await this.db.saveTrade(trade);
      logger.debug('Trade logged', { tradeId: trade.id });
    } catch (error) {
      logger.error('Failed to log trade', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async logCopyDecision(trade: Trade, validation: ValidationResult): Promise<void> {
    try {
      await this.db.saveCopyDecision(
        trade.id,
        validation.shouldCopy,
        validation.reason,
        validation.checks
      );

      logger.debug('Copy decision logged', {
        tradeId: trade.id,
        shouldCopy: validation.shouldCopy,
      });
    } catch (error) {
      logger.error('Failed to log copy decision', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async logExecution(trade: Trade, result: ExecutionResult): Promise<void> {
    try {
      await this.db.saveExecutionLog(
        trade.id,
        result.success,
        result.positionId,
        result.orderId,
        result.executedPrice,
        result.executedSize,
        result.error
      );

      logger.debug('Execution logged', {
        tradeId: trade.id,
        success: result.success,
      });
    } catch (error) {
      logger.error('Failed to log execution', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async markProcessed(tradeId: string): Promise<void> {
    try {
      await this.db.markTradeProcessed(tradeId);
      logger.debug('Trade marked as processed', { tradeId });
    } catch (error) {
      logger.error('Failed to mark trade as processed', {
        tradeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
