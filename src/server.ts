#!/usr/bin/env node

import { config, configManager } from './config';
import { createDatabase } from './db/schema';
import { createLogger } from './utils/logger';
import { StatsServer } from './api/StatsServer';
import { RiskManager } from './risk/RiskManager';

const logger = createLogger('Server');

class DashboardServer {
  private statsServer!: StatsServer;
  private db!: Awaited<ReturnType<typeof createDatabase>>;
  private riskManager!: RiskManager;
  private isShuttingDown = false;
  private initialized = false;

  constructor() {
    logger.info('Initializing Dashboard Server...');
    this.displayBanner();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database
    const databaseUrl = configManager.getDatabaseUrl();
    this.db = await createDatabase(databaseUrl);

    // Initialize risk manager for capital calculations
    // Note: The bot process handles actual risk management
    this.riskManager = new RiskManager(config, this.db, 10000);

    // Initialize stats server with capital calculator from risk manager
    const port = process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT) : 3001;
    this.statsServer = new StatsServer(
      this.db, 
      this.riskManager.getCapitalCalculator(),
      port
    );

    this.setupGracefulShutdown();
    this.initialized = true;
  }

  private displayBanner(): void {
    console.log('\n=================================================');
    console.log('   POLYMARKET DASHBOARD SERVER');
    console.log('=================================================');
    console.log(`Dashboard Port: ${process.env.DASHBOARD_PORT || 3001}`);
    console.log('=================================================\n');
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      await this.statsServer.stop();
      await this.db.close();

      logger.info('Server shutdown complete');
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
      logger.info('Starting dashboard server...');
      await this.initialize();
      await this.statsServer.start();
      logger.info('Dashboard server started successfully');
    } catch (error) {
      logger.error('Failed to start server', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  }
}

const server = new DashboardServer();
server.start().catch((error) => {
  logger.error('Fatal error', { error: error.message });
  process.exit(1);
});
