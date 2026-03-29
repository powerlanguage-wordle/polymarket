import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import type { Config } from '../types';

const logger = createLogger('PolymarketClient');

interface WebSocketTrade {
  id: string;
  market: string;
  asset_id: string;
  maker_address: string;
  taker_address: string;
  side: string;
  price: string;
  size: string;
  timestamp: number;
  transaction_hash?: string;
  outcome?: string;
}

export class PolymarketClient extends EventEmitter {
  private client: ClobClient | null = null;
  private config: Config;
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isConnecting: boolean = false;
  private subscribedAddresses: Set<string> = new Set();

  constructor(config: Config, apiKey: string, apiSecret: string, apiPassphrase: string, privateKey: string) {
    super();
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

  connectWebSocket(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      logger.debug('WebSocket already connecting or connected');
      return;
    }

    this.isConnecting = true;

    try {
      logger.info('Connecting to WebSocket', { url: this.config.polymarket.wsUrl });
      
      this.ws = new WebSocket(this.config.polymarket.wsUrl);

      this.ws.on('open', () => {
        logger.info('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Resubscribe to all addresses
        this.subscribedAddresses.forEach(address => {
          this.subscribeToTraderInternal(address);
        });
        
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error', { error: error.message });
        this.isConnecting = false;
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn('WebSocket closed', { code, reason: reason.toString() });
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      });

      // Ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Ping every 30 seconds

    } catch (error) {
      logger.error('Failed to create WebSocket connection', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      this.emit('disconnected');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    logger.info(`Scheduling WebSocket reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: any): void {
    if (message.type === 'trade' && message.data) {
      const trade: WebSocketTrade = message.data;
      
      // Check if this trade is from a subscribed address
      if (this.subscribedAddresses.has(trade.maker_address.toLowerCase())) {
        logger.debug('Received trade from WebSocket', {
          id: trade.id,
          maker: trade.maker_address,
          market: trade.market,
        });
        
        this.emit('trade', trade);
      }
    } else if (message.type === 'subscribed') {
      logger.info('Successfully subscribed to trades', { address: message.address });
    } else if (message.type === 'error') {
      logger.error('WebSocket error message', { error: message.message });
    }
  }

  subscribeToTrader(address: string): void {
    this.subscribedAddresses.add(address.toLowerCase());
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribeToTraderInternal(address);
    }
  }

  private subscribeToTraderInternal(address: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscribeMessage = {
      type: 'subscribe',
      channel: 'trades',
      maker_address: address.toLowerCase(),
    };

    logger.info('Subscribing to trader trades', { address });
    this.ws.send(JSON.stringify(subscribeMessage));
  }

  unsubscribeFromTrader(address: string): void {
    this.subscribedAddresses.delete(address.toLowerCase());
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const unsubscribeMessage = {
      type: 'unsubscribe',
      channel: 'trades',
      maker_address: address.toLowerCase(),
    };

    logger.info('Unsubscribing from trader trades', { address });
    this.ws.send(JSON.stringify(unsubscribeMessage));
  }

  disconnectWebSocket(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    this.subscribedAddresses.clear();
    logger.info('WebSocket disconnected');
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
