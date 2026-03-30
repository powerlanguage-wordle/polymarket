#!/usr/bin/env ts-node

import readline from 'readline';
import fs from 'fs';
import path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupTelegram() {
  console.log('\n📱 TELEGRAM NOTIFICATION SETUP\n');
  console.log('Telegram notifications allow you to receive:');
  console.log('  • Real-time alerts when trades are detected');
  console.log('  • Trade execution results (success or failure)');
  console.log('  • Hourly summaries of your bot\'s activity\n');

  console.log('To set up Telegram notifications:\n');
  console.log('1️⃣  Create a Telegram Bot:');
  console.log('   • Open Telegram and search for @BotFather');
  console.log('   • Send /newbot and follow the instructions');
  console.log('   • Copy the bot token (looks like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)\n');

  const botToken = await question('Enter your Telegram bot token (or press Enter to skip): ');
  
  if (!botToken.trim()) {
    console.log('\n⏭️  Skipping Telegram setup. You can configure it later in .env\n');
    rl.close();
    return;
  }

  console.log('\n2️⃣  Get Your Chat ID:');
  console.log('   • Open Telegram and search for @userinfobot');
  console.log('   • Send /start to the bot');
  console.log('   • Copy your chat ID (a number)\n');

  const chatId = await question('Enter your Telegram chat ID: ');

  if (!chatId.trim()) {
    console.log('\n⚠️  Chat ID is required. Skipping Telegram setup.\n');
    rl.close();
    return;
  }

  // Read .env file
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Update or add Telegram credentials
  const telegramBotTokenRegex = /^TELEGRAM_BOT_TOKEN=.*/m;
  const telegramChatIdRegex = /^TELEGRAM_CHAT_ID=.*/m;

  if (telegramBotTokenRegex.test(envContent)) {
    envContent = envContent.replace(telegramBotTokenRegex, `TELEGRAM_BOT_TOKEN=${botToken}`);
  } else {
    envContent += `\n\n# Telegram Notifications\nTELEGRAM_BOT_TOKEN=${botToken}`;
  }

  if (telegramChatIdRegex.test(envContent)) {
    envContent = envContent.replace(telegramChatIdRegex, `TELEGRAM_CHAT_ID=${chatId}`);
  } else {
    if (!telegramBotTokenRegex.test(envContent)) {
      envContent += `\nTELEGRAM_CHAT_ID=${chatId}`;
    } else {
      envContent = envContent.replace(
        `TELEGRAM_BOT_TOKEN=${botToken}`,
        `TELEGRAM_BOT_TOKEN=${botToken}\nTELEGRAM_CHAT_ID=${chatId}`
      );
    }
  }

  // Write back to .env
  fs.writeFileSync(envPath, envContent.trim() + '\n');

  console.log('\n✅ Telegram credentials saved to .env\n');
  console.log('To test your setup:');
  console.log('  1. Restart your bot: npm start');
  console.log('  2. You should receive a startup notification\n');

  rl.close();
}

setupTelegram().catch((error) => {
  console.error('Error setting up Telegram:', error);
  process.exit(1);
});
