import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';
import type { Config } from '../types';

dotenv.config();

const ConfigSchema = z.object({
  trackedTraders: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).min(1),
  riskParams: z.object({
    minTradeSize: z.number().positive(),
    maxCapitalPerTrade: z.number().min(0).max(1),
    maxSlippage: z.number().min(0).max(1),
    maxPositions: z.number().int().positive(),
    maxMarketExposure: z.number().min(0).max(1),
  }),
  execution: z.object({
    mode: z.enum(['paper', 'live']),
    pollInterval: z.number().int().positive(),
    retryAttempts: z.number().int().min(0),
    retryDelayMs: z.number().int().positive(),
  }),
  polymarket: z.object({
    clobApiUrl: z.string().url(),
    chainId: z.number().int(),
    feeRateBps: z.number().int().min(0),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    directory: z.string(),
    maxFiles: z.number().int().positive(),
    maxSize: z.string(),
  }),
});

class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.json');

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Configuration file not found at ${configPath}. Please copy config.example.json to config.json and configure it.`
      );
    }

    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const result = ConfigSchema.safeParse(rawConfig);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    const config = result.data;

    this.normalizeTraderAddresses(config);

    return config;
  }

  private normalizeTraderAddresses(config: Config): void {
    config.trackedTraders = config.trackedTraders.map((addr) => addr.toLowerCase());
  }

  getConfig(): Config {
    return this.config;
  }

  isTrackedTrader(address: string): boolean {
    return this.config.trackedTraders.includes(address.toLowerCase());
  }

  getApiKey(): string {
    const apiKey = process.env.POLYMARKET_API_KEY;
    if (!apiKey && this.config.execution.mode === 'live') {
      throw new Error('POLYMARKET_API_KEY environment variable is required for live trading');
    }
    return apiKey || '';
  }

  getApiSecret(): string {
    const apiSecret = process.env.POLYMARKET_API_SECRET;
    if (!apiSecret && this.config.execution.mode === 'live') {
      throw new Error('POLYMARKET_API_SECRET environment variable is required for live trading');
    }
    return apiSecret || '';
  }

  getApiPassphrase(): string {
    const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;
    if (!apiPassphrase && this.config.execution.mode === 'live') {
      throw new Error('POLYMARKET_API_PASSPHRASE environment variable is required for live trading');
    }
    return apiPassphrase || '';
  }

  getPrivateKey(): string {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    if (!privateKey && this.config.execution.mode === 'live') {
      throw new Error('POLYMARKET_PRIVATE_KEY environment variable is required for live trading');
    }
    return privateKey || '';
  }

  getChainId(): number {
    return this.config.polymarket.chainId;
  }

  getDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    return databaseUrl;
  }
}

export const configManager = ConfigManager.getInstance();
export const config = configManager.getConfig();
