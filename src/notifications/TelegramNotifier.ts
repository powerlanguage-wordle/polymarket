import TelegramBot from 'node-telegram-bot-api';
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
  private bot: TelegramBot | null = null;
  private chatId: string = '';
  private enabled: boolean = false;
  private summaryProvider: SummaryProvider | null = null;

  constructor(botToken?: string, chatId?: string) {
    if (!botToken || !chatId) {
      logger.info('Telegram notifications disabled - no credentials provided');
      return;
    }

    try {
      // Enable polling for command handling
      this.bot = new TelegramBot(botToken, { polling: true });
      this.chatId = chatId;
      this.enabled = true;
      this.setupCommands();
      logger.info('Telegram notifier initialized successfully with command support');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  setSummaryProvider(provider: SummaryProvider): void {
    this.summaryProvider = provider;
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // /start command
    this.bot.onText(/\/start/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      
      const welcomeMessage = `
🤖 <b>Polymarket Copy Trading Bot</b>

Available commands:
/summary - Get current portfolio summary
/positions - List all open positions
/help - Show this help message
/status - Check bot status

The bot will notify you when trades are detected and executed.
      `.trim();

      await this.bot?.sendMessage(this.chatId, welcomeMessage, { parse_mode: 'HTML' });
    });

    // /help command
    this.bot.onText(/\/help/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      
      const helpMessage = `
📖 <b>Bot Commands</b>

/summary - Portfolio summary with PnL and recent activity
/positions - List all open positions with details
/status - Bot health and monitoring status
/help - Show this help message

<i>Note: Commands only work from authorized chat ID</i>
      `.trim();

      await this.bot?.sendMessage(this.chatId, helpMessage, { parse_mode: 'HTML' });
    });

    // /summary command
    this.bot.onText(/\/summary/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      
      try {
        if (!this.summaryProvider) {
          await this.bot?.sendMessage(this.chatId, '❌ Summary provider not initialized', { parse_mode: 'HTML' });
          return;
        }

        const summary = await this.summaryProvider.getSummaryData();
        await this.sendSummary(summary);
      } catch (error) {
        logger.error('Failed to handle /summary command', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.bot?.sendMessage(this.chatId, '❌ Failed to fetch summary', { parse_mode: 'HTML' });
      }
    });

    // /positions command
    this.bot.onText(/\/positions/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      
      try {
        if (!this.summaryProvider) {
          await this.bot?.sendMessage(this.chatId, '❌ Summary provider not initialized', { parse_mode: 'HTML' });
          return;
        }

        const summary = await this.summaryProvider.getSummaryData();
        
        if (summary.positions.length === 0) {
          await this.bot?.sendMessage(this.chatId, '📭 No open positions', { parse_mode: 'HTML' });
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

        await this.bot?.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Failed to handle /positions command', {
          error: error instanceof Error ? error.message : String(error),
        });
        await this.bot?.sendMessage(this.chatId, '❌ Failed to fetch positions', { parse_mode: 'HTML' });
      }
    });

    // /status command
    this.bot.onText(/\/status/, async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      
      const statusMessage = `
✅ <b>Bot Status</b>

Status: <b>RUNNING</b>
Mode: Paper Trading
Monitoring: Active

<i>${new Date().toLocaleString()}</i>
      `.trim();

      await this.bot?.sendMessage(this.chatId, statusMessage, { parse_mode: 'HTML' });
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

      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
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

      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Failed to send execution notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendSummary(summary: {
    totalTrades: number;
    processedTrades: number;
    copiedTrades: number;
    skippedTrades: number;
    positions: Position[];
    totalPnL: number;
    openPositions: number;
    closedPositions: number;
  }): Promise<void> {
    if (!this.enabled || !this.bot) return;

    try {
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

      message += `

<i>${new Date().toLocaleString()}</i>`;

      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      logger.info('Summary sent to Telegram');
    } catch (error) {
      logger.error('Failed to send summary', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendStartupMessage(mode: string): Promise<void> {
    if (!this.enabled || !this.bot) return;

    try {
      const message = `
🚀 <b>Bot Started</b>

<b>Mode:</b> ${mode.toUpperCase()}
<b>Status:</b> Monitoring for trades

<b>Available commands:</b>
/summary - Get portfolio summary
/positions - List open positions
/status - Check bot status
/help - Show all commands

<i>${new Date().toLocaleString()}</i>
      `.trim();

      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
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
        await this.bot.stopPolling();
        logger.info('Telegram bot stopped');
      } catch (error) {
        logger.error('Error stopping Telegram bot', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
