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
    // Initialize client for both paper and live modes (needed for trade monitoring)
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

  async getTrades(makerAddress: string, limit: number = 20): Promise<any[]> {
    if (!this.client) {
      throw new Error('CLOB client not initialized');
    }

    try {
      const trades = await this.client.getTrades({ maker_address: makerAddress }, true);
      return trades.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get trades', {
        makerAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
