import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger';
import type { Trade, Position } from '../types';

const logger = createLogger('Database');

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database;

  private constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  static getInstance(dbPath = './data/bot.db'): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(dbPath);
    }
    return DatabaseManager.instance;
  }

  private initialize(): void {
    logger.info('Initializing database schema...');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        trader TEXT NOT NULL,
        market TEXT NOT NULL,
        market_name TEXT,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
        price REAL NOT NULL,
        size REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        transaction_hash TEXT,
        processed INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
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
        size REAL NOT NULL,
        entry_price REAL NOT NULL,
        current_price REAL,
        pnl REAL,
        status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        original_trader TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market);
      CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
      CREATE INDEX IF NOT EXISTS idx_positions_opened_at ON positions(opened_at);

      CREATE TABLE IF NOT EXISTS copy_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        should_copy INTEGER NOT NULL,
        reason TEXT,
        trader_whitelisted INTEGER,
        size_threshold INTEGER,
        liquidity_ok INTEGER,
        slippage_ok INTEGER,
        risk_limits_ok INTEGER,
        timestamp INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (trade_id) REFERENCES trades(id)
      );

      CREATE INDEX IF NOT EXISTS idx_copy_decisions_trade_id ON copy_decisions(trade_id);
      CREATE INDEX IF NOT EXISTS idx_copy_decisions_timestamp ON copy_decisions(timestamp);

      CREATE TABLE IF NOT EXISTS execution_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        position_id TEXT,
        success INTEGER NOT NULL,
        order_id TEXT,
        executed_price REAL,
        executed_size REAL,
        error TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (trade_id) REFERENCES trades(id),
        FOREIGN KEY (position_id) REFERENCES positions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_execution_log_trade_id ON execution_log(trade_id);
      CREATE INDEX IF NOT EXISTS idx_execution_log_timestamp ON execution_log(timestamp);
    `);

    logger.info('Database schema initialized successfully');
  }

  saveTrade(trade: Trade): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO trades (
        id, trader, market, market_name, outcome, side, price, size, timestamp, transaction_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trade.id,
      trade.trader.toLowerCase(),
      trade.market,
      trade.marketName,
      trade.outcome,
      trade.side,
      trade.price,
      trade.size,
      trade.timestamp,
      trade.transactionHash
    );
  }

  isTradeProcessed(tradeId: string): boolean {
    const stmt = this.db.prepare('SELECT processed FROM trades WHERE id = ?');
    const result = stmt.get(tradeId) as { processed: number } | undefined;
    return result?.processed === 1;
  }

  markTradeProcessed(tradeId: string): void {
    const stmt = this.db.prepare('UPDATE trades SET processed = 1 WHERE id = ?');
    stmt.run(tradeId);
  }

  savePosition(position: Position): void {
    const stmt = this.db.prepare(`
      INSERT INTO positions (
        id, market, outcome, side, size, entry_price, current_price, pnl,
        status, opened_at, closed_at, original_trader
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
      position.originalTrader
    );
  }

  updatePosition(positionId: string, updates: Partial<Position>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.currentPrice !== undefined) {
      fields.push('current_price = ?');
      values.push(updates.currentPrice);
    }
    if (updates.pnl !== undefined) {
      fields.push('pnl = ?');
      values.push(updates.pnl);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.closedAt !== undefined) {
      fields.push('closed_at = ?');
      values.push(updates.closedAt);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = unixepoch()');
    values.push(positionId);

    const stmt = this.db.prepare(`UPDATE positions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  getOpenPositions(): Position[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, market, outcome, side, size, entry_price as entryPrice,
        current_price as currentPrice, pnl, status, opened_at as openedAt,
        closed_at as closedAt, original_trader as originalTrader
      FROM positions 
      WHERE status = 'open'
      ORDER BY opened_at DESC
    `);

    return stmt.all() as Position[];
  }

  getPositionsByMarket(market: string): Position[] {
    const stmt = this.db.prepare(`
      SELECT 
        id, market, outcome, side, size, entry_price as entryPrice,
        current_price as currentPrice, pnl, status, opened_at as openedAt,
        closed_at as closedAt, original_trader as originalTrader
      FROM positions 
      WHERE market = ? AND status = 'open'
    `);

    return stmt.all(market) as Position[];
  }

  getTotalMarketExposure(market: string): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(size * entry_price), 0) as total
      FROM positions 
      WHERE market = ? AND status = 'open'
    `);

    const result = stmt.get(market) as { total: number };
    return result.total;
  }

  saveCopyDecision(
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
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO copy_decisions (
        trade_id, should_copy, reason, trader_whitelisted, size_threshold,
        liquidity_ok, slippage_ok, risk_limits_ok
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tradeId,
      shouldCopy ? 1 : 0,
      reason,
      checks.traderWhitelisted ? 1 : 0,
      checks.sizeThreshold ? 1 : 0,
      checks.liquidity ? 1 : 0,
      checks.slippage ? 1 : 0,
      checks.riskLimits ? 1 : 0
    );
  }

  saveExecutionLog(
    tradeId: string,
    success: boolean,
    positionId?: string,
    orderId?: string,
    executedPrice?: number,
    executedSize?: number,
    error?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO execution_log (
        trade_id, position_id, success, order_id, executed_price, executed_size, error, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    `);

    stmt.run(tradeId, positionId, success ? 1 : 0, orderId, executedPrice, executedSize, error);
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}

export const createDatabase = (dbPath?: string): DatabaseManager => {
  return DatabaseManager.getInstance(dbPath);
};
