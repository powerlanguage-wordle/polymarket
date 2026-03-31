import { Telegraf, Context } from 'telegraf';
import { createLogger } from '../utils/logger';
import type { Trade, ValidationResult, ExecutionResult, Position } from '../types';

const logger = createLogger('TelegramNotifier');

export interface SummaryProvider {
  getSummaryData(): Promise<{
    totalTrades: number;
    processedTrades: number;
    copiedTrades: number;
    skippedTrades: number;
    positions: Position[];
    totalPnL: number;
    openPositions: number;
    closedPositions: number;
  }>;
}

export class TelegramNotifier {
  private bot: Telegraf | null = null;
  private chatId: string = '';
  private enabled: boolean = false;
  private summaryProvider: SummaryProvider | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(botToken?: string, chatId?: string) {
    if (!botToken || !chatId) {
      console.log('   ℹ️  Telegram notifications disabled (no credentials)');
      logger.info('Telegram notifications disabled - no credentials provided');
      return;
    }

    this.chatId = chatId;
    this.initPromise = this.initializeBot(botToken);
  }

  private async initializeBot(botToken: string): Promise<void> {
    try {
      console.log('   🔄 Initializing Telegram bot...');
      logger.info('Initializing Telegram bot with Telegraf');
      
      // Create Telegraf bot instance
      this.bot = new Telegraf(botToken);
      
      // IMPORTANT: Delete webhook first to avoid conflicts
      try {
        console.log('   🔄 Clearing webhook and pending updates...');
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
        logger.info('Webhook cleared successfully');
        
        // Wait a moment for Telegram to fully clear
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        logger.warn('Could not clear webhook', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Set up command handlers
      this.setupCommands();
      
      // Launch bot with retries
      let retries = 3;
      let lastError: Error | null = null;
      
      while (retries > 0) {
        try {
          // Save existing signal handlers before launch
          const existingSigint = process.listeners('SIGINT');
          const existingSigterm = process.listeners('SIGTERM');
          
          // Launch Telegraf bot (this will add its own signal handlers)
          await this.bot.launch({
            dropPendingUpdates: true,
          });
          
          // Remove Telegraf's signal handlers (the last ones added)
          const allSigint = process.listeners('SIGINT');
          const allSigterm = process.listeners('SIGTERM');
          
          // Remove only the NEW handlers that Telegraf added
          allSigint.slice(existingSigint.length).forEach(listener => {
            process.removeListener('SIGINT', listener as NodeJS.SignalsListener);
          });
          allSigterm.slice(existingSigterm.length).forEach(listener => {
            process.removeListener('SIGTERM', listener as NodeJS.SignalsListener);
          });
          
          this.enabled = true;
          console.log('   ✅ Telegram bot ready (/summary, /positions, /help)');
          logger.info('Telegram bot launched successfully (signal handlers preserved)');
          
          return; // Success!
          
        } catch (error) {
          lastError = error as Error;
          retries--;
          
          if (retries > 0) {
            const waitTime = (4 - retries) * 2000; // 2s, 4s, 6s
            logger.warn(`Telegram launch failed, retrying in ${waitTime/1000}s...`, {
              error: error instanceof Error ? error.message : String(error),
              retriesLeft: retries,
            });
            console.log(`   ⚠️  Conflict detected, retrying in ${waitTime/1000}s... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      // All retries failed
      throw lastError || new Error('Failed to launch Telegram bot');
      
    } catch (error) {
      console.log('   ❌ Failed to launch Telegram bot');
      console.log('   💡 Run: npm run fix:telegram to resolve conflicts');
      logger.error('Failed to launch Telegram bot', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.enabled = false;
      throw error;
    }
  }

  async waitForReady(): Promise<void> {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        // Initialization failed, but don't throw - just log
        logger.debug('Telegram initialization failed or not configured');
      }
    }
  }

  setSummaryProvider(provider: SummaryProvider): void {
    this.summaryProvider = provider;
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // /start command
    this.bot.command('start', async (ctx: Context) => {
      if (ctx.chat?.id.toString() !== this.chatId) return;
      
      const welcomeMessage = `
🤖 <b>Polymarket Copy Trading Bot</b>

Available commands:
/summary - Get current portfolio summary
/positions - List all open positions
/help - Show this help message
/status - Check bot status

The bot will notify you when trades are detected and executed.
      `.trim();

      await ctx.replyWithHTML(welcomeMessage);
    });

    // /help command
    this.bot.command('help', async (ctx: Context) => {
      if (ctx.chat?.id.toString() !== this.chatId) return;
      
      const helpMessage = `
📖 <b>Bot Commands</b>

/summary - Portfolio summary with PnL and recent activity
/positions - List all open positions with details
/status - Bot health and monitoring status
/help - Show this help message

<i>Note: Commands only work from authorized chat ID</i>
      `.trim();

      await ctx.replyWithHTML(helpMessage);
    });

    // /summary command
    this.bot.command('summary', async (ctx: Context) => {
      if (ctx.chat?.id.toString() !== this.chatId) return;
      
      try {
        if (!this.summaryProvider) {
          await ctx.replyWithHTML('❌ Summary provider not initialized');
          return;
        }

        const summary = await this.summaryProvider.getSummaryData();
        await this.sendSummaryMessage(ctx, summary);
      } catch (error) {
        logger.error('Failed to handle /summary command', {
          error: error instanceof Error ? error.message : String(error),
        });
        await ctx.replyWithHTML('❌ Failed to fetch summary');
      }
    });

    // /positions command
    this.bot.command('positions', async (ctx: Context) => {
      if (ctx.chat?.id.toString() !== this.chatId) return;
      
      try {
        if (!this.summaryProvider) {
          await ctx.replyWithHTML('❌ Summary provider not initialized');
          return;
        }

        const summary = await this.summaryProvider.getSummaryData();
        
        if (summary.positions.length === 0) {
          await ctx.replyWithHTML('📭 No open positions');
          return;
        }

        let message = `📋 <b>Open Positions (${summary.positions.length})</b>\n\n`;
        
        summary.positions.forEach((pos, index) => {
          const posEmoji = (pos.pnl || 0) >= 0 ? '📈' : '📉';
          const posSign = (pos.pnl || 0) >= 0 ? '+' : '';
          const pnlPercent = pos.currentPrice && pos.entryPrice 
            ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2)
            : '0.00';
          
          message += `<b>${index + 1}.</b> ${pos.outcome} ${pos.side}\n`;
          message += `   Size: ${pos.size.toFixed(2)} @ $${pos.entryPrice.toFixed(4)}\n`;
          message += `   Current: $${(pos.currentPrice || pos.entryPrice).toFixed(4)}\n`;
          message += `   ${posEmoji} PnL: ${posSign}$${(pos.pnl || 0).toFixed(2)} (${posSign}${pnlPercent}%)\n\n`;
        });

        message += `<i>${new Date().toLocaleString()}</i>`;

        await ctx.replyWithHTML(message);
      } catch (error) {
        logger.error('Failed to handle /positions command', {
          error: error instanceof Error ? error.message : String(error),
        });
        await ctx.replyWithHTML('❌ Failed to fetch positions');
      }
    });

    // /status command
    this.bot.command('status', async (ctx: Context) => {
      if (ctx.chat?.id.toString() !== this.chatId) return;
      
      const statusMessage = `
✅ <b>Bot Status</b>

Status: <b>RUNNING</b>
Mode: Paper Trading
Monitoring: Active

<i>${new Date().toLocaleString()}</i>
      `.trim();

      await ctx.replyWithHTML(statusMessage);
    });

    logger.info('Telegram bot commands configured');
  }

  async sendTradeDetected(trade: Trade, validation: ValidationResult): Promise<void> {
    if (!this.enabled || !this.bot) return;

    try {
      const emoji = validation.shouldCopy ? '✅' : '❌';
      const action = validation.shouldCopy ? 'COPYING' : 'SKIPPED';
      
      const message = `
🔔 <b>Trade Detected</b>

${emoji} <b>${action}</b>

<b>Market:</b> <code>${trade.market.slice(0, 12)}...</code>
<b>Outcome:</b> ${trade.outcome}
<b>Side:</b> ${trade.side}
<b>Size:</b> ${trade.size.toFixed(2)}
<b>Price:</b> $${trade.price.toFixed(4)}
<b>Value:</b> $${(trade.size * trade.price).toFixed(2)}

<b>Decision:</b> ${validation.reason || 'Passed all checks'}

<b>Checks:</b>
${this.formatChecks(validation)}

<i>${new Date().toLocaleString()}</i>
      `.trim();

      await this.bot.telegram.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Failed to send trade notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendExecutionResult(trade: Trade, result: ExecutionResult): Promise<void> {
    if (!this.enabled || !this.bot) return;

    try {
      const emoji = result.success ? '✨' : '❌';
      const status = result.success ? 'SUCCESS' : 'FAILED';
      
      let message = `
${emoji} <b>Trade Execution ${status}</b>

<b>Trade ID:</b> <code>${trade.id.slice(0, 12)}...</code>
<b>Market:</b> ${trade.outcome}
<b>Side:</b> ${trade.side}
      `.trim();

      if (result.success) {
        message += `

<b>Order ID:</b> <code>${result.orderId}</code>
<b>Position ID:</b> <code>${result.positionId?.slice(0, 12)}...</code>
<b>Executed Size:</b> ${result.executedSize?.toFixed(2) || trade.size.toFixed(2)}
<b>Executed Price:</b> $${result.executedPrice?.toFixed(4) || trade.price.toFixed(4)}
<b>Value:</b> $${((result.executedSize || trade.size) * (result.executedPrice || trade.price)).toFixed(2)}
        `.trim();
      } else {
        message += `

<b>Error:</b> ${result.error}
        `.trim();
      }

      message += `

<i>${new Date().toLocaleString()}</i>`;

      await this.bot.telegram.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Failed to send execution notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendSummaryMessage(ctx: Context, summary: {
    totalTrades: number;
    processedTrades: number;
    copiedTrades: number;
    skippedTrades: number;
    positions: Position[];
    totalPnL: number;
    openPositions: number;
    closedPositions: number;
  }): Promise<void> {
    const pnlEmoji = summary.totalPnL >= 0 ? '📈' : '📉';
    const pnlColor = summary.totalPnL >= 0 ? '+' : '';
    
    let message = `
📊 <b>Portfolio Summary</b>

<b>📈 Trading Activity</b>
• Total trades: ${summary.totalTrades}
• Processed: ${summary.processedTrades}
• ✅ Copied: ${summary.copiedTrades}
• ❌ Skipped: ${summary.skippedTrades}

<b>💼 Positions</b>
• Open: ${summary.openPositions}
• Closed: ${summary.closedPositions}
• Total PnL: ${pnlEmoji} ${pnlColor}$${summary.totalPnL.toFixed(2)}
    `.trim();

    if (summary.positions.length > 0) {
      message += '\n\n<b>📋 Top Positions:</b>';
      const topPositions = summary.positions
        .sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
        .slice(0, 5);

      topPositions.forEach(pos => {
        const posEmoji = (pos.pnl || 0) >= 0 ? '📈' : '📉';
        const posSign = (pos.pnl || 0) >= 0 ? '+' : '';
        message += `\n• ${pos.outcome} ${pos.side} ${pos.size.toFixed(1)} @ $${pos.entryPrice.toFixed(3)} ${posEmoji} ${posSign}$${(pos.pnl || 0).toFixed(2)}`;
      });
    }

    message += `\n\n<i>${new Date().toLocaleString()}</i>`;
    await ctx.replyWithHTML(message);
  }

  async sendStartupMessage(mode: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Cannot send startup message - Telegram bot not initialized');
      return;
    }

    try {
      const message = `
🚀 <b>Bot Started</b>

<b>Mode:</b> ${mode.toUpperCase()}
<b>Status:</b> Monitoring for trades

<b>📱 Commands are ready!</b>
Try: /summary or /help

<i>${new Date().toLocaleString()}</i>
      `.trim();

      await this.bot.telegram.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      logger.info('Startup message sent to Telegram');
    } catch (error) {
      logger.error('Failed to send startup message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  private formatChecks(validation: ValidationResult): string {
    const checks = [];
    
    if (validation.checks.traderWhitelisted !== undefined) {
      checks.push(`Trader: ${validation.checks.traderWhitelisted ? '✅' : '❌'}`);
    }
    if (validation.checks.sizeThreshold !== undefined) {
      checks.push(`Size: ${validation.checks.sizeThreshold ? '✅' : '❌'}`);
    }
    if (validation.checks.liquidity !== undefined) {
      checks.push(`Liquidity: ${validation.checks.liquidity ? '✅' : '❌'}`);
    }
    if (validation.checks.slippage !== undefined) {
      checks.push(`Slippage: ${validation.checks.slippage ? '✅' : '❌'}`);
    }
    if (validation.checks.riskLimits !== undefined) {
      checks.push(`Risk: ${validation.checks.riskLimits ? '✅' : '❌'}`);
    }

    return checks.join(' | ');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async stop(): Promise<void> {
    if (this.bot) {
      try {
        this.bot.stop();
        logger.info('Telegram bot stopped');
      } catch (error) {
        logger.error('Error stopping Telegram bot', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.enabled || !this.bot) {
      return { healthy: false, error: 'Bot not enabled' };
    }

    try {
      await this.bot.telegram.getMe();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
