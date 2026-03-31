#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

async function fixTelegramConflicts() {
  console.log('🔧 Fixing Telegram bot conflicts...\n');
  
  try {
    // Create Telegraf bot instance
    const bot = new Telegraf(botToken!);
    
    console.log('1️⃣  Getting bot info...');
    const me = await bot.telegram.getMe();
    console.log(`   ✅ Bot: @${me.username}\n`);
    
    console.log('2️⃣  Deleting webhook (if exists)...');
    const webhookDeleted = await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log(`   ${webhookDeleted ? '✅' : '⚠️ '} Webhook deleted/cleared\n`);
    
    console.log('✅ Telegram bot conflicts resolved!');
    console.log('\nYou can now restart your bot with: npm start\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

fixTelegramConflicts();
