import { createLogger } from '../utils/logger';
import { DatabaseManager } from '../db/schema';
import { PolymarketClient } from './PolymarketClient';
import type { Trade, ExecutionResult, Position, Config } from '../types';

const logger = createLogger('LiveTrader');

export class LiveTrader {
  private db: DatabaseManager;
  private client: PolymarketClient;
  private config: Config;

  constructor(config: Config, db: DatabaseManager, client: PolymarketClient) {
    this.config = config;
    this.db = db;
    this.client = client;
  }

  async executeTrade(trade: Trade, positionSize: number): Promise<ExecutionResult> {
    logger.info('Executing live trade', {
      tradeId: trade.id,
      market: trade.market,
      side: trade.side,
      size: positionSize,
      price: trade.price,
    });

    let attempt = 0;
    let lastError: string | undefined;

    while (attempt < this.config.execution.retryAttempts) {
      try {
        const result = await this.client.placeOrder(trade.outcome, trade.side, trade.price, positionSize);

        if (result.success && result.orderId) {
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

          await this.db.savePosition(position);

          await this.db.saveExecutionLog(
            trade.id,
            true,
            positionId,
            result.orderId,
            trade.price,
            positionSize
          );

          logger.info('Live trade executed successfully', {
            orderId: result.orderId,
            positionId,
            value: (positionSize * trade.price).toFixed(2),
          });

          return {
            success: true,
            orderId: result.orderId,
            positionId,
            executedPrice: trade.price,
            executedSize: positionSize,
            timestamp: Date.now(),
          };
        }

        lastError = result.error || 'Unknown error';
        logger.warn('Trade execution failed', {
          tradeId: trade.id,
          attempt: attempt + 1,
          error: lastError,
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error('Exception during trade execution', {
          tradeId: trade.id,
          attempt: attempt + 1,
          error: lastError,
        });
      }

      attempt++;

      if (attempt < this.config.execution.retryAttempts) {
        const delay = this.config.execution.retryDelayMs * Math.pow(2, attempt - 1);
        logger.info('Retrying trade execution', {
          tradeId: trade.id,
          attempt: attempt + 1,
          delayMs: delay,
        });
        await this.sleep(delay);
      }
    }

    await this.db.saveExecutionLog(trade.id, false, undefined, undefined, undefined, undefined, lastError);

    logger.error('Trade execution failed after all retries', {
      tradeId: trade.id,
      attempts: this.config.execution.retryAttempts,
      lastError,
    });

    return {
      success: false,
      error: lastError || 'Failed after multiple attempts',
      timestamp: Date.now(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
