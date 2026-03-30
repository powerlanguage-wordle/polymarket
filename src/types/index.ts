export interface Trade {
  id: string;
  trader: string;
  market: string;
  asset?: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
  transactionHash?: string;
}

export interface Position {
  id: string;
  market: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  entryPrice: number;
  currentPrice?: number;
  pnl?: number;
  status: 'open' | 'closed';
  openedAt: number;
  closedAt?: number;
  originalTrader?: string;
}

export interface ValidationResult {
  shouldCopy: boolean;
  reason?: string;
  checks: {
    traderWhitelisted: boolean;
    sizeThreshold: boolean;
    liquidity: boolean;
    slippage: boolean;
    riskLimits: boolean;
  };
}

export interface RiskLimits {
  canTrade: boolean;
  reason?: string;
  allocatedCapital?: number;
  positionSize?: number;
}

export interface OrderBookSnapshot {
  market: string;
  outcome: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}

export interface Config {
  trackedTraders: string[];
  riskParams: {
    minTradeSize: number;
    maxCapitalPerTrade: number;
    maxSlippage: number;
    maxPositions: number;
    maxMarketExposure: number;
  };
  execution: {
    mode: 'paper' | 'live';
    pollInterval: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  polymarket: {
    clobApiUrl: string;
    chainId: number;
    feeRateBps: number;
  };
  logging: {
    level: string;
    directory: string;
    maxFiles: number;
    maxSize: string;
  };
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  positionId?: string;
  executedPrice?: number;
  executedSize?: number;
  error?: string;
  timestamp: number;
}

export interface PolymarketOrderRequest {
  market: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  tokenId: string;
}

export interface MarketInfo {
  id: string;
  question: string;
  outcomes: string[];
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
}
