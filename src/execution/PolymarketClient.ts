import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import type { Config } from '../types';

const logger = createLogger('PolymarketClient');

export class PolymarketClient {
  private client: ClobClient | null = null;
  private config: Config;

  constructor(config: Config, apiKey: string, apiSecret: string, apiPassphrase: string, privateKey: string) {
    this.config = config;
    this.initializeClient(apiKey, apiSecret, apiPassphrase, privateKey);
  }

  private initializeClient(apiKey: string, apiSecret: string, apiPassphrase: string, privateKey: string): void {
    try {
      const wallet = new ethers.Wallet(privateKey);

      // Construct API credentials object
      const creds = apiKey && apiSecret && apiPassphrase ? {
        key: apiKey,
        secret: apiSecret,
        passphrase: apiPassphrase,
      } : undefined;

      this.client = new ClobClient(
        this.config.polymarket.clobApiUrl,
        this.config.polymarket.chainId,
        wallet as any,
        creds
      );

      logger.info('Polymarket CLOB client initialized', {
        chainId: this.config.polymarket.chainId,
        address: wallet.address,
        authenticated: !!creds,
      });
    } catch (error) {
      logger.error('Failed to initialize CLOB client', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async placeOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'CLOB client not initialized',
      };
    }

    try {
      logger.info('Placing order on Polymarket', {
        tokenId,
        side,
        price,
        size,
      });

      const orderArgs = {
        tokenID: tokenId,
        price: price.toString(),
        size: size.toString(),
        side: side === 'BUY' ? 'BUY' : 'SELL',
        feeRateBps: this.config.polymarket.feeRateBps.toString(),
      };

      const signedOrder = await this.client.createOrder(orderArgs as any);
      const orderResult = await this.client.postOrder(signedOrder as any);

      logger.info('Order placed successfully', {
        orderId: orderResult.orderID,
      });

      return {
        success: true,
        orderId: orderResult.orderID,
      };
    } catch (error) {
      logger.error('Failed to place order', {
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getOrderStatus(orderId: string): Promise<any> {
    if (!this.client) {
      throw new Error('CLOB client not initialized');
    }

    try {
      const order = await this.client.getOrder(orderId);
      return order;
    } catch (error) {
      logger.error('Failed to get order status', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('CLOB client not initialized');
    }

    try {
      await this.client.cancelOrder(orderId as any);
      logger.info('Order cancelled', { orderId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel order', {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async getTrades(userAddress: string, limit: number = 20): Promise<any[]> {
    try {
      console.log(`   🔍 Fetching trades for trader: ${userAddress.substring(0, 10)}...`);
      
      // Use the data-api endpoint which includes ALL trades (both maker and taker)
      const url = `https://data-api.polymarket.com/trades?user=${userAddress}&limit=${limit}&takerOnly=false`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const trades = await response.json() as any[];
      console.log(`   ℹ️ Found ${trades.length} trades for this trader`);
      
      if (trades.length > 0 && trades[0]) {
        const firstTrade = trades[0];
        const timestamp = firstTrade.timestamp;
        console.log(`   🕐 Most recent trade: ${new Date(timestamp * 1000).toISOString()}`);
        console.log(`   📊 ${firstTrade.side} ${firstTrade.size} of "${firstTrade.outcome}" @ $${firstTrade.price.toFixed(4)}`);
      }
      
      return trades;
    } catch (error) {
      console.error(`   ❌ API Error fetching trades for ${userAddress.substring(0, 10)}...: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Failed to get trades', {
        userAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
