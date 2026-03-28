#!/usr/bin/env node

import { config, configManager } from './config';
import { createDatabase } from './db/schema';
import { createLogger } from './utils/logger';
import { TradeMonitor } from './monitor/TradeMonitor';
import { ValidationPipeline } from './validation/ValidationPipeline';
import { RiskManager } from './risk/RiskManager';
import { PaperTrader } from './execution/PaperTrader';
import { LiveTrader } from './execution/LiveTrader';
import { PolymarketClient } from './execution/PolymarketClient';
import { PositionManager } from './positions/PositionManager';
import { TradeLogger } from './positions/TradeLogger';
import { HealthChecker } from './monitoring/HealthChecker';
import { StatsServer } from './api/StatsServer';
import type { Trade } from './types';

const logger = createLogger('Bot');

class PolymarketCopyBot {
  private tradeMonitor: TradeMonitor;
  private validationPipeline: ValidationPipeline;
  private riskManager: RiskManager;
  private trader: PaperTrader | LiveTrader;
  private positionManager: PositionManager;
  private tradeLogger: TradeLogger;
  private healthChecker: HealthChecker;
  private statsServer: StatsServer;
  private db: ReturnType<typeof createDatabase>;
  private isShuttingDown = false;

  constructor() {
    logger.info('Initializing Polymarket Copy Trading Bot...');
    this.displayBanner();

    this.db = createDatabase(config.database.path);

    // Create ClobClient for both paper and live modes (needed for trade monitoring)
    const apiKey = configManager.getApiKey();
    const apiSecret = configManager.getApiSecret();
    const apiPassphrase = configManager.getApiPassphrase();
    const privateKey = configManager.getPrivateKey();
    const polymarketClient = new PolymarketClient(config, apiKey, apiSecret, apiPassphrase, privateKey);

    this.tradeMonitor = new TradeMonitor(config, polymarketClient);
    this.validationPipeline = new ValidationPipeline(config);
    this.riskManager = new RiskManager(config, this.db, 10000);
    this.positionManager = new PositionManager(this.db);
    this.tradeLogger = new TradeLogger(this.db);
    this.healthChecker = new HealthChecker();
    this.statsServer = new StatsServer(this.db, this.riskManager.getCapitalCalculator());

    if (config.execution.mode === 'paper') {
      this.trader = new PaperTrader(this.db);
      logger.info('Running in PAPER TRADING mode');
    } else {
      this.trader = new LiveTrader(config, this.db, polymarketClient);
      logger.warn('Running in LIVE TRADING mode - real money at risk!');
    }

    this.setupEventHandlers();
    this.setupGracefulShutdown();
  }

  private displayBanner(): void {
    console.log('\n=================================================');
    console.log('   POLYMARKET COPY TRADING BOT');
    console.log('=================================================');
    console.log(`Mode: ${config.execution.mode.toUpperCase()}`);
    console.log(`Tracked Traders: ${config.trackedTraders.length}`);
    console.log(`Poll Interval: ${config.execution.pollInterval}ms`);
    console.log(`Max Capital per Trade: ${(config.riskParams.maxCapitalPerTrade * 100).toFixed(1)}%`);
    console.log(`Max Slippage: ${(config.riskParams.maxSlippage * 100).toFixed(1)}%`);
    console.log(`Max Positions: ${config.riskParams.maxPositions}`);
    console.log('=================================================\n');
  }

  private setupEventHandlers(): void {
    this.tradeMonitor.on('newTrade', async (trade: Trade) => {
      await this.handleNewTrade(trade);
    });
  }

  private async handleNewTrade(trade: Trade): Promise<void> {
    if (this.isShuttingDown) {
      logger.info('Ignoring trade due to shutdown in progress', { tradeId: trade.id });
      return;
    }

    try {
      logger.info('Processing new trade', {
        tradeId: trade.id,
        trader: trade.trader,
        market: trade.market,
        side: trade.side,
        price: trade.price,
        size: trade.size,
      });

      this.tradeLogger.logTrade(trade);
      this.healthChecker.updateLastTradeTime();

      if (this.db.isTradeProcessed(trade.id)) {
        logger.debug('Trade already processed, skipping', { tradeId: trade.id });
        return;
      }

      const riskLimits = this.riskManager.canTakeTrade(trade);

      if (!riskLimits.canTrade) {
        logger.info('Trade rejected by risk manager', {
          tradeId: trade.id,
          reason: riskLimits.reason,
        });

        const validation = await this.validationPipeline.shouldCopyTrade(trade, 0);
        validation.shouldCopy = false;
        validation.reason = riskLimits.reason;
        validation.checks.riskLimits = false;

        this.tradeLogger.logCopyDecision(trade, validation);
        this.tradeLogger.markProcessed(trade.id);
        return;
      }

      const positionSize = riskLimits.positionSize || 0;

      const validation = await this.validationPipeline.shouldCopyTrade(trade, positionSize);
      this.tradeLogger.logCopyDecision(trade, validation);

      if (!validation.shouldCopy) {
        logger.info('Trade validation failed', {
          tradeId: trade.id,
          reason: validation.reason,
        });
        this.tradeLogger.markProcessed(trade.id);
        return;
      }

      logger.info('Trade passed all checks, executing...', {
        tradeId: trade.id,
        positionSize: positionSize.toFixed(2),
        value: (positionSize * trade.price).toFixed(2),
      });

      const executionResult = await this.trader.executeTrade(trade, positionSize);
      this.tradeLogger.logExecution(trade, executionResult);

      if (executionResult.success) {
        logger.info('Trade copied successfully!', {
          tradeId: trade.id,
          orderId: executionResult.orderId,
          positionId: executionResult.positionId,
        });
      } else {
        logger.error('Trade execution failed', {
          tradeId: trade.id,
          error: executionResult.error,
        });
      }

      this.tradeLogger.markProcessed(trade.id);
      this.logPortfolioSummary();
    } catch (error) {
      logger.error('Error handling new trade', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private logPortfolioSummary(): void {
    const summary = this.positionManager.getPortfolioSummary();
    logger.info('Portfolio Summary', {
      positions: summary.totalPositions,
      value: summary.totalValue.toFixed(2),
      pnl: summary.totalPnl.toFixed(2),
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      this.tradeMonitor.stop();
      await this.statsServer.stop();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.logPortfolioSummary();

      this.db.close();

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });

      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', {
        reason: String(reason),
      });
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting bot...');

      await this.statsServer.start();
      await this.tradeMonitor.start();

      setInterval(async () => {
        const health = await this.healthChecker.checkHealth();
        if (!health.healthy) {
          logger.warn('Health check failed', { issues: health.issues });
        }
      }, 60000);

      logger.info('Bot started successfully and monitoring trades');
    } catch (error) {
      logger.error('Failed to start bot', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  }
}

const bot = new PolymarketCopyBot();
bot.start().catch((error) => {
  logger.error('Fatal error', { error: error.message });
  process.exit(1);
});
