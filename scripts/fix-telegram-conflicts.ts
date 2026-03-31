#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

async function fixTelegramConflicts() {
  console.log('🔧 Fixing Telegram bot conflicts...\n');
  
  try {
    // Create bot without polling
    const bot = new TelegramBot(botToken!, { polling: false });
    
    console.log('1️⃣  Getting bot info...');
    const me = await bot.getMe();
    console.log(`   ✅ Bot: @${me.username}\n`);
    
    console.log('2️⃣  Deleting webhook (if exists)...');
    const webhookDeleted = await bot.deleteWebHook();
    console.log(`   ${webhookDeleted ? '✅' : '⚠️ '} Webhook deleted/cleared\n`);
    
    console.log('3️⃣  Getting updates to clear any pending...');
    try {
      await bot.getUpdates({ offset: -1, timeout: 1 });
      console.log('   ✅ Pending updates cleared\n');
    } catch (error) {
      console.log('   ⚠️  No pending updates or error clearing\n');
    }
    
    console.log('✅ Telegram bot conflicts resolved!');
    console.log('\nYou can now restart your bot with: npm start\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

fixTelegramConflicts();
