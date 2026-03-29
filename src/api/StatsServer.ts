import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { DatabaseManager } from '../db/schema';
import { CapitalCalculator } from '../risk/CapitalCalculator';
import { createLogger } from '../utils/logger';
import type { Position } from '../types';

const logger = createLogger('StatsServer');

export class StatsServer {
  private app: Express;
  private db: DatabaseManager;
  private capitalCalculator: CapitalCalculator;
  private port: number;
  private server: any;

  constructor(db: DatabaseManager, capitalCalculator: CapitalCalculator, port: number = 3001) {
    this.app = express();
    this.db = db;
    this.capitalCalculator = capitalCalculator;
    this.port = port;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Enable CORS for local development
    this.app.use(cors());
    this.app.use(express.json());

    // Serve static files from dashboard/dist
    const distPath = path.join(process.cwd(), 'dashboard', 'dist');
    this.app.use(express.static(distPath));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Portfolio summary endpoint
    this.app.get('/api/stats/portfolio', async (_req: Request, res: Response) => {
      try {
        const positions = await this.db.getOpenPositions();
        
        const totalValue = positions.reduce((sum, pos) => {
          return sum + pos.size * pos.entryPrice;
        }, 0);

        const totalPnl = positions.reduce((sum, pos) => {
          return sum + (pos.pnl || 0);
        }, 0);

        const totalCapital = this.capitalCalculator.getTotalCapital();
        const capitalUtilization = totalCapital > 0 
          ? (totalValue / totalCapital) * 100 
          : 0;

        res.json({
          totalPositions: positions.length,
          totalValue: Number(totalValue.toFixed(2)),
          totalPnl: Number(totalPnl.toFixed(2)),
          capitalUtilization: Number(capitalUtilization.toFixed(2)),
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error('Error fetching portfolio stats', { error });
        res.status(500).json({ error: 'Failed to fetch portfolio stats' });
      }
    });

    // All positions endpoint
    this.app.get('/api/stats/positions', async (_req: Request, res: Response) => {
      try {
        const positions = await this.db.getOpenPositions();
        
        // Format positions for UI
        const formattedPositions = positions.map((pos: Position) => ({
          id: pos.id,
          market: pos.market,
          outcome: pos.outcome,
          side: pos.side,
          size: Number(pos.size.toFixed(2)),
          entryPrice: Number(pos.entryPrice.toFixed(4)),
          currentPrice: pos.currentPrice ? Number(pos.currentPrice.toFixed(4)) : null,
          pnl: pos.pnl ? Number(pos.pnl.toFixed(2)) : 0,
          pnlPercentage: pos.currentPrice && pos.entryPrice
            ? Number(((pos.currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2))
            : 0,
          status: pos.status,
          openedAt: pos.openedAt,
          originalTrader: pos.originalTrader,
        }));

        res.json({
          positions: formattedPositions,
          count: formattedPositions.length,
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error('Error fetching positions', { error });
        res.status(500).json({ error: 'Failed to fetch positions' });
      }
    });

    // Capital overview endpoint
    this.app.get('/api/stats/overview', async (_req: Request, res: Response) => {
      try {
        const totalCapital = this.capitalCalculator.getTotalCapital();
        const availableCapital = await this.capitalCalculator.calculateAvailableCapital();
        const allocatedCapital = totalCapital - availableCapital;
        
        // Get exposure by market
        const positions = await this.db.getOpenPositions();
        const exposureByMarket: { [key: string]: number } = {};
        
        positions.forEach((pos: Position) => {
          const exposure = pos.size * pos.entryPrice;
          if (exposureByMarket[pos.market]) {
            exposureByMarket[pos.market] += exposure;
          } else {
            exposureByMarket[pos.market] = exposure;
          }
        });

        res.json({
          totalCapital: Number(totalCapital.toFixed(2)),
          allocatedCapital: Number(allocatedCapital.toFixed(2)),
          availableCapital: Number(availableCapital.toFixed(2)),
          utilizationPercentage: totalCapital > 0 
            ? Number((allocatedCapital / totalCapital * 100).toFixed(2))
            : 0,
          exposureByMarket: Object.entries(exposureByMarket).map(([market, exposure]) => ({
            market,
            exposure: Number(exposure.toFixed(2)),
            percentage: totalCapital > 0 
              ? Number((exposure / totalCapital * 100).toFixed(2))
              : 0,
          })),
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.error('Error fetching capital overview', { error });
        res.status(500).json({ error: 'Failed to fetch capital overview' });
      }
    });

    // Serve index.html for all other routes (SPA fallback)
    this.app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(process.cwd(), 'dashboard', 'dist', 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.status(404).send('Dashboard not built. Run: npm run build:dashboard');
        }
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Stats server started on http://localhost:${this.port}`);
        logger.info(`Dashboard available at http://localhost:${this.port}`);
        logger.info(`API endpoints at http://localhost:${this.port}/api/stats/*`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Stats server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
