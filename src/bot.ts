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
import { TelegramNotifier, SummaryProvider } from './notifications/TelegramNotifier';
import type { Trade } from './types';

const logger = createLogger('Bot');

class PolymarketCopyBot implements SummaryProvider {
  private tradeMonitor!: TradeMonitor;
  private validationPipeline!: ValidationPipeline;
  private riskManager!: RiskManager;
  private trader!: PaperTrader | LiveTrader;
  private positionManager!: PositionManager;
  private tradeLogger!: TradeLogger;
  private healthChecker!: HealthChecker;
  private statsServer!: StatsServer;
  private telegramNotifier!: TelegramNotifier;
  private db!: Awaited<ReturnType<typeof createDatabase>>;
  private isShuttingDown = false;
  private initialized = false;

  constructor() {
    logger.info('Initializing Polymarket Copy Trading Bot...');
    this.displayBanner();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database
    const databaseUrl = configManager.getDatabaseUrl();
    this.db = await createDatabase(databaseUrl);

    // Get total capital from environment or use default
    const totalCapital = process.env.TOTAL_CAPITAL ? parseFloat(process.env.TOTAL_CAPITAL) : 10000;
    logger.info('Total capital configured', { totalCapital: totalCapital.toFixed(2) });

    // Create ClobClient for both paper and live modes (needed for trade monitoring)
    const apiKey = configManager.getApiKey();
    const apiSecret = configManager.getApiSecret();
    const apiPassphrase = configManager.getApiPassphrase();
    const privateKey = configManager.getPrivateKey();
    const polymarketClient = new PolymarketClient(config, apiKey, apiSecret, apiPassphrase, privateKey);

    this.tradeMonitor = new TradeMonitor(config, polymarketClient);
    this.validationPipeline = new ValidationPipeline(config);
    this.riskManager = new RiskManager(config, this.db, totalCapital);
    this.positionManager = new PositionManager(this.db);
    this.tradeLogger = new TradeLogger(this.db);
    this.healthChecker = new HealthChecker();
    this.statsServer = new StatsServer(
      this.db, 
      this.riskManager.getCapitalCalculator(),
      3001,
      config.polymarket.clobApiUrl
    );
    
    // Initialize Telegram notifier
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    this.telegramNotifier = new TelegramNotifier(telegramToken, telegramChatId);

    if (config.execution.mode === 'paper') {
      this.trader = new PaperTrader(this.db);
      logger.info('Running in PAPER TRADING mode');
    } else {
      this.trader = new LiveTrader(config, this.db, polymarketClient);
      logger.warn('Running in LIVE TRADING mode - real money at risk!');
    }

    this.setupEventHandlers();
    this.setupGracefulShutdown();
    
    // Set up summary provider for Telegram commands
    this.telegramNotifier.setSummaryProvider(this);
    
    this.initialized = true;
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
      console.log(`\n📊 PROCESSING TRADE: ${trade.id}`);
      console.log(`   Trader: ${trade.trader}`);
      console.log(`   Market: ${trade.market}`);
      console.log(`   Side: ${trade.side} | Size: ${trade.size} | Price: $${trade.price}`);
      
      logger.info('Processing new trade', {
        tradeId: trade.id,
        trader: trade.trader,
        market: trade.market,
        side: trade.side,
        price: trade.price,
        size: trade.size,
      });

      await this.tradeLogger.logTrade(trade);
      this.healthChecker.updateLastTradeTime();

      if (await this.db.isTradeProcessed(trade.id)) {
        logger.debug('Trade already processed, skipping', { tradeId: trade.id });
        return;
      }

      const riskLimits = await this.riskManager.canTakeTrade(trade);

      if (!riskLimits.canTrade) {
        console.log(`   ❌ REJECTED by risk manager: ${riskLimits.reason}`);
        logger.info('Trade rejected by risk manager', {
          tradeId: trade.id,
          reason: riskLimits.reason,
        });

        const validation = await this.validationPipeline.shouldCopyTrade(trade, 0);
        validation.shouldCopy = false;
        validation.reason = riskLimits.reason;
        validation.checks.riskLimits = false;

        await this.tradeLogger.logCopyDecision(trade, validation);
        await this.tradeLogger.markProcessed(trade.id);
        return;
      }

      const positionSize = riskLimits.positionSize || 0;

      const validation = await this.validationPipeline.shouldCopyTrade(trade, positionSize);
      await this.tradeLogger.logCopyDecision(trade, validation);
      
      // Send Telegram notification for trade decision
      await this.telegramNotifier.sendTradeDetected(trade, validation);

      if (!validation.shouldCopy) {
        console.log(`   ❌ REJECTED by validation: ${validation.reason}`);
        logger.info('Trade validation failed', {
          tradeId: trade.id,
          reason: validation.reason,
        });
        await this.tradeLogger.markProcessed(trade.id);
        return;
      }

      console.log(`   ✅ VALIDATION PASSED - Executing trade...`);
      console.log(`   Position Size: ${positionSize.toFixed(2)} | Value: $${(positionSize * trade.price).toFixed(2)}`);
      
      logger.info('Trade passed all checks, executing...', {
        tradeId: trade.id,
        positionSize: positionSize.toFixed(2),
        value: (positionSize * trade.price).toFixed(2),
      });

      const executionResult = await this.trader.executeTrade(trade, positionSize);
      await this.tradeLogger.logExecution(trade, executionResult);
      
      // Send Telegram notification for execution result
      await this.telegramNotifier.sendExecutionResult(trade, executionResult);

      if (executionResult.success) {
        console.log(`   ✨ TRADE COPIED SUCCESSFULLY!`);
        console.log(`   Order ID: ${executionResult.orderId}`);
        console.log(`   Position ID: ${executionResult.positionId}\n`);
        
        logger.info('Trade copied successfully!', {
          tradeId: trade.id,
          orderId: executionResult.orderId,
          positionId: executionResult.positionId,
        });
      } else {
        console.log(`   ❌ EXECUTION FAILED: ${executionResult.error}\n`);
        
        logger.error('Trade execution failed', {
          tradeId: trade.id,
          error: executionResult.error,
        });
      }

      await this.tradeLogger.markProcessed(trade.id);
      await this.logPortfolioSummary();
    } catch (error) {
      logger.error('Error handling new trade', {
        tradeId: trade.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private async logPortfolioSummary(): Promise<void> {
    const summary = await this.positionManager.getPortfolioSummary();
    logger.info('Portfolio Summary', {
      positions: summary.totalPositions,
      value: summary.totalValue.toFixed(2),
      pnl: summary.totalPnl.toFixed(2),
    });
  }

  /**
   * Implement SummaryProvider interface for Telegram commands
   */
  async getSummaryData(): Promise<{
    totalTrades: number;
    processedTrades: number;
    copiedTrades: number;
    skippedTrades: number;
    positions: any[];
    totalPnL: number;
    openPositions: number;
    closedPositions: number;
  }> {
    const summary = await this.positionManager.getPortfolioSummary();
    const positions = await this.positionManager.getOpenPositions();
    
    // Get trade statistics from database (last 24 hours)
    const stats = await this.db.getPool().query(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed_trades
      FROM trades
      WHERE created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')::BIGINT
    `);
    
    const decisions = await this.db.getPool().query(`
      SELECT 
        SUM(CASE WHEN should_copy = true THEN 1 ELSE 0 END) as copied_trades,
        SUM(CASE WHEN should_copy = false THEN 1 ELSE 0 END) as skipped_trades
      FROM copy_decisions
      WHERE timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')::BIGINT
    `);
    
    const openPositions = positions.filter(p => p.status === 'open').length;
    const closedPositions = positions.filter(p => p.status === 'closed').length;
    
    return {
      totalTrades: parseInt(stats.rows[0]?.total_trades || '0'),
      processedTrades: parseInt(stats.rows[0]?.processed_trades || '0'),
      copiedTrades: parseInt(decisions.rows[0]?.copied_trades || '0'),
      skippedTrades: parseInt(decisions.rows[0]?.skipped_trades || '0'),
      positions,
      totalPnL: summary.totalPnl,
      openPositions,
      closedPositions,
    };
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      this.tradeMonitor.stop();
      await this.telegramNotifier.stop();
      await this.statsServer.stop();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await this.logPortfolioSummary();

      await this.db.close();

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
      console.log('\n\u2705 BOT STARTING...\n');
      logger.info('Starting bot...');

      await this.initialize();
      await this.statsServer.start();
      await this.tradeMonitor.start();
      
      // Send startup notification
      await this.telegramNotifier.sendStartupMessage(config.execution.mode);
      

      console.log('\n\u2728 BOT IS NOW RUNNING AND MONITORING FOR TRADES!\n');

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
