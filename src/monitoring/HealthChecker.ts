import { createLogger } from '../utils/logger';

const logger = createLogger('HealthChecker');

export class HealthChecker {
  private lastTradeTime: number = 0;
  private isHealthy: boolean = true;
  private issues: string[] = [];

  updateLastTradeTime(): void {
    this.lastTradeTime = Date.now();
  }

  async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    this.issues = [];

    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    const maxIdleTime = 5 * 60 * 1000;

    if (this.lastTradeTime > 0 && timeSinceLastTrade > maxIdleTime) {
      this.issues.push(`No trades detected in ${Math.floor(timeSinceLastTrade / 1000)}s`);
    }

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB > 500) {
      this.issues.push(`High memory usage: ${heapUsedMB.toFixed(2)}MB`);
    }

    this.isHealthy = this.issues.length === 0;

    if (!this.isHealthy) {
      logger.warn('Health check failed', { issues: this.issues });
    } else {
      logger.debug('Health check passed');
    }

    return {
      healthy: this.isHealthy,
      issues: [...this.issues],
    };
  }

  getStatus(): {
    healthy: boolean;
    uptime: number;
    lastTradeTime: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    return {
      healthy: this.isHealthy,
      uptime: process.uptime(),
      lastTradeTime: this.lastTradeTime,
      memoryUsage: process.memoryUsage(),
    };
  }
}
