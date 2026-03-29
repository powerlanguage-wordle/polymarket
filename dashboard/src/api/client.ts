// Use relative URL to work in both development and production
// In development: proxied by Vite dev server
// In production: served from the same origin as the bot
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface PortfolioStats {
  totalPositions: number;
  totalValue: number;
  totalPnl: number;
  capitalUtilization: number;
  timestamp: number;
}

export interface Position {
  id: string;
  market: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  entryPrice: number;
  currentPrice: number | null;
  pnl: number;
  pnlPercentage: number;
  status: 'open' | 'closed';
  openedAt: number;
  originalTrader?: string;
}

export interface PositionsResponse {
  positions: Position[];
  count: number;
  timestamp: number;
}

export interface MarketExposure {
  market: string;
  exposure: number;
  percentage: number;
}

export interface CapitalOverview {
  totalCapital: number;
  allocatedCapital: number;
  availableCapital: number;
  utilizationPercentage: number;
  exposureByMarket: MarketExposure[];
  timestamp: number;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async fetchPortfolioStats(): Promise<PortfolioStats> {
    const response = await fetch(`${this.baseUrl}/stats/portfolio`);
    if (!response.ok) {
      throw new Error(`Failed to fetch portfolio stats: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchPositions(): Promise<PositionsResponse> {
    const response = await fetch(`${this.baseUrl}/stats/positions`);
    if (!response.ok) {
      throw new Error(`Failed to fetch positions: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchCapitalOverview(): Promise<CapitalOverview> {
    const response = await fetch(`${this.baseUrl}/stats/overview`);
    if (!response.ok) {
      throw new Error(`Failed to fetch capital overview: ${response.statusText}`);
    }
    return response.json();
  }
}

export const apiClient = new ApiClient();
