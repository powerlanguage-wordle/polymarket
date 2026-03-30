import TelegramBot from 'node-telegram-bot-api';
import { createLogger } from '../utils/logger';
import type { Trade, ValidationResult, ExecutionResult, Position } from '../types';

const logger = createLogger('TelegramNotifier');

export class TelegramNotifier {
  private bot: TelegramBot | null = null;
  private chatId: string = '';
  private enabled: boolean = false;

  constructor(botToken?: string, chatId?: string) {
    if (!botToken || !chatId) {
      logger.info('Telegram notifications disabled - no credentials provided');
      return;
    }

    try {
      this.bot = new TelegramBot(botToken, { polling: false });
      this.chatId = chatId;
      this.enabled = true;
      logger.info('Telegram notifier initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  async sendHourlySummary(summary: {
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
📊 <b>Hourly Summary</b>

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
      logger.info('Hourly summary sent to Telegram');
    } catch (error) {
      logger.error('Failed to send hourly summary', {
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
}
