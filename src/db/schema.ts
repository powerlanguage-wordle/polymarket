import { Pool } from 'pg';
import { createLogger } from '../utils/logger';
import type { Trade, Position } from '../types';

const logger = createLogger('Database');

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool;

  private constructor(databaseUrl: string) {
    // Detect if we need SSL (cloud databases like Render require it)
    const requiresSsl = databaseUrl.includes('render.com') || 
                       databaseUrl.includes('amazonaws.com') ||
                       databaseUrl.includes('supabase.co') ||
                       process.env.NODE_ENV === 'production';

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });
  }

  static async getInstance(databaseUrl: string): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(databaseUrl);
      await DatabaseManager.instance.initialize();
    }
    return DatabaseManager.instance;
  }

  private async initialize(): Promise<void> {
    logger.info('Initializing database schema...');

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id TEXT PRIMARY KEY,
          trader TEXT NOT NULL,
          market TEXT NOT NULL,
          market_name TEXT,
          outcome TEXT NOT NULL,
          side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
          price DOUBLE PRECISION NOT NULL,
          size DOUBLE PRECISION NOT NULL,
          timestamp BIGINT NOT NULL,
          transaction_hash TEXT,
          processed BOOLEAN DEFAULT FALSE,
          created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader);
        CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market);
        CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
        CREATE INDEX IF NOT EXISTS idx_trades_processed ON trades(processed);

        CREATE TABLE IF NOT EXISTS positions (
          id TEXT PRIMARY KEY,
          market TEXT NOT NULL,
          outcome TEXT NOT NULL,
          side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
          size DOUBLE PRECISION NOT NULL,
          entry_price DOUBLE PRECISION NOT NULL,
          current_price DOUBLE PRECISION,
          pnl DOUBLE PRECISION,
          status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
          opened_at BIGINT NOT NULL,
          closed_at BIGINT,
          original_trader TEXT,
          created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
          updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market);
        CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
        CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at);

        CREATE TABLE IF NOT EXISTS copy_decisions (
          id SERIAL PRIMARY KEY,
          trade_id TEXT NOT NULL,
          should_copy BOOLEAN NOT NULL,
          reason TEXT,
          trader_whitelisted BOOLEAN,
          size_threshold BOOLEAN,
          liquidity_ok BOOLEAN,
          slippage_ok BOOLEAN,
          risk_limits_ok BOOLEAN,
          timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_copy_decisions_trade_id ON copy_decisions(trade_id);
        CREATE INDEX IF NOT EXISTS idx_copy_decisions_timestamp ON copy_decisions(timestamp);

        CREATE TABLE IF NOT EXISTS execution_log (
          id SERIAL PRIMARY KEY,
          trade_id TEXT NOT NULL,
          position_id TEXT,
          success BOOLEAN NOT NULL,
          order_id TEXT,
          executed_price DOUBLE PRECISION,
          executed_size DOUBLE PRECISION,
          error TEXT,
          timestamp BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_execution_log_trade_id ON execution_log(trade_id);
        CREATE INDEX IF NOT EXISTS idx_execution_log_timestamp ON execution_log(timestamp);
      `);

      logger.info('Database schema initialized successfully');
    } finally {
      client.release();
    }
  }

  async saveTrade(trade: Trade): Promise<void> {
    await this.pool.query(
      `INSERT INTO trades (
        id, trader, market, market_name, outcome, side, price, size, timestamp, transaction_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      [
        trade.id,
        trade.trader.toLowerCase(),
        trade.market,
        trade.marketName,
        trade.outcome,
        trade.side,
        trade.price,
        trade.size,
        trade.timestamp,
        trade.transactionHash,
      ]
    );
  }

  async isTradeProcessed(tradeId: string): Promise<boolean> {
    const result = await this.pool.query<{ processed: boolean }>(
      'SELECT processed FROM trades WHERE id = $1',
      [tradeId]
    );
    return result.rows[0]?.processed === true;
  }

  async markTradeProcessed(tradeId: string): Promise<void> {
    await this.pool.query('UPDATE trades SET processed = TRUE WHERE id = $1', [tradeId]);
  }

  async savePosition(position: Position): Promise<void> {
    await this.pool.query(
      `INSERT INTO positions (
        id, market, outcome, side, size, entry_price, current_price, pnl,
        status, opened_at, closed_at, original_trader
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        position.id,
        position.market,
        position.outcome,
        position.side,
        position.size,
        position.entryPrice,
        position.currentPrice,
        position.pnl,
        position.status,
        position.openedAt,
        position.closedAt,
        position.originalTrader,
      ]
    );
  }

  async updatePosition(positionId: string, updates: Partial<Position>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.currentPrice !== undefined) {
      fields.push(`current_price = $${paramIndex++}`);
      values.push(updates.currentPrice);
    }
    if (updates.pnl !== undefined) {
      fields.push(`pnl = $${paramIndex++}`);
      values.push(updates.pnl);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.closedAt !== undefined) {
      fields.push(`closed_at = $${paramIndex++}`);
      values.push(updates.closedAt);
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT`);
    values.push(positionId);

    await this.pool.query(
      `UPDATE positions SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async getOpenPositions(): Promise<Position[]> {
    const result = await this.pool.query<Position>(
      `SELECT 
        id, market, outcome, side, size, entry_price as "entryPrice",
        current_price as "currentPrice", pnl, status, opened_at as "openedAt",
        closed_at as "closedAt", original_trader as "originalTrader"
      FROM positions 
      WHERE status = 'open'
      ORDER BY opened_at DESC`
    );

    return result.rows;
  }

  async getPositionsByMarket(market: string): Promise<Position[]> {
    const result = await this.pool.query<Position>(
      `SELECT 
        id, market, outcome, side, size, entry_price as "entryPrice",
        current_price as "currentPrice", pnl, status, opened_at as "openedAt",
        closed_at as "closedAt", original_trader as "originalTrader"
      FROM positions 
      WHERE market = $1 AND status = 'open'`,
      [market]
    );

    return result.rows;
  }

  async getTotalMarketExposure(market: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(size * entry_price), 0) as total
      FROM positions 
      WHERE market = $1 AND status = 'open'`,
      [market]
    );

    return parseFloat(result.rows[0].total);
  }

  async saveCopyDecision(
    tradeId: string,
    shouldCopy: boolean,
    reason: string | undefined,
    checks: {
      traderWhitelisted: boolean;
      sizeThreshold: boolean;
      liquidity: boolean;
      slippage: boolean;
      riskLimits: boolean;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO copy_decisions (
        trade_id, should_copy, reason, trader_whitelisted, size_threshold,
        liquidity_ok, slippage_ok, risk_limits_ok
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tradeId,
        shouldCopy,
        reason,
        checks.traderWhitelisted,
        checks.sizeThreshold,
        checks.liquidity,
        checks.slippage,
        checks.riskLimits,
      ]
    );
  }

  async saveExecutionLog(
    tradeId: string,
    success: boolean,
    positionId?: string,
    orderId?: string,
    executedPrice?: number,
    executedSize?: number,
    error?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO execution_log (
        trade_id, position_id, success, order_id, executed_price, executed_size, error, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW())::BIGINT)`,
      [tradeId, positionId, success, orderId, executedPrice, executedSize, error]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}

export const createDatabase = async (databaseUrl: string): Promise<DatabaseManager> => {
  return DatabaseManager.getInstance(databaseUrl);
};
