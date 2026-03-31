#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken || !chatId) {
  console.error('❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in .env');
  process.exit(1);
}

async function testTelegramBot() {
  console.log('🔄 Testing Telegram bot connection...\n');
  
  try {
    // Create Telegraf bot instance
    const bot = new Telegraf(botToken!);
    
    // Test 1: Get bot info
    console.log('1️⃣  Getting bot info...');
    const me = await bot.telegram.getMe();
    console.log(`   ✅ Bot: @${me.username} (${me.first_name})\n`);
    
    // Test 2: Set up test command
    console.log('2️⃣  Setting up /test command...');
    bot.command('test', async (ctx) => {
      if (ctx.chat?.id.toString() === chatId) {
        await ctx.reply('✅ /test command working!');
        console.log('   ✅ /test command received and responded');
      }
    });
    console.log('   ✅ Command handler set up\n');
    
    // Test 3: Send test message
    console.log('3️⃣  Sending test message...');
    await bot.telegram.sendMessage(chatId!, '🧪 Test message - Telegram bot is working!\n\nTry sending: /test');
    console.log('   ✅ Message sent\n');
    
    // Test 4: Launch bot with dropPendingUpdates
    console.log('4️⃣  Launching bot...');
    await bot.launch({ dropPendingUpdates: true });
    console.log('   ✅ Bot launched\n');
    
    console.log('✅ All tests passed!');
    console.log('\n📱 Try sending /test to your bot in Telegram\n');
    console.log('Press Ctrl+C to stop...\n');
    
    // Enable graceful stop
    process.once('SIGINT', () => {
      console.log('\n\n🛑 Stopping bot...');
      bot.stop();
      console.log('✅ Bot stopped');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testTelegramBot();
