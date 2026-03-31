#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';

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
    // Create bot instance
    const bot = new TelegramBot(botToken!, { polling: false });
    
    // Test 1: Get bot info
    console.log('1️⃣  Getting bot info...');
    const me = await bot.getMe();
    console.log(`   ✅ Bot: @${me.username} (${me.first_name})\n`);
    
    // Test 2: Delete any existing webhook
    console.log('2️⃣  Deleting webhook...');
    await bot.deleteWebHook();
    console.log('   ✅ Webhook deleted\n');
    
    // Test 3: Start polling
    console.log('3️⃣  Starting polling...');
    await bot.startPolling({ restart: true });
    console.log('   ✅ Polling started\n');
    
    // Test 4: Send test message
    console.log('4️⃣  Sending test message...');
    await bot.sendMessage(chatId!, '🧪 Test message - Telegram bot is working!\n\nTry sending: /start', {
      parse_mode: 'HTML',
    });
    console.log('   ✅ Message sent\n');
    
    // Test 5: Set up test command
    console.log('5️⃣  Setting up /test command...');
    bot.onText(/\/test/, async (msg) => {
      if (msg.chat.id.toString() === chatId) {
        await bot.sendMessage(chatId!, '✅ /test command working!', { parse_mode: 'HTML' });
        console.log('   ✅ /test command received and responded');
      }
    });
    console.log('   ✅ Command handler set up\n');
    
    console.log('✅ All tests passed!');
    console.log('\n📱 Try sending /test to your bot in Telegram\n');
    console.log('Press Ctrl+C to stop...\n');
    
    // Handle polling errors
    bot.on('polling_error', (error) => {
      console.error('❌ Polling error:', error.message);
    });
    
    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping bot...');
      await bot.stopPolling();
      console.log('✅ Bot stopped');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testTelegramBot();
