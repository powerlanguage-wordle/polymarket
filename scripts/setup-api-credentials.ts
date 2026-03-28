import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config();

interface ApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function deriveApiCredentials(privateKey: string): Promise<ApiCredentials> {
  console.log('\n🔐 Deriving API credentials from private key...\n');

  // Ensure the private key starts with 0x
  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log(`📍 Wallet Address: ${wallet.address}`);

  const client = new ClobClient(
    'https://clob.polymarket.com',
    137, // Polygon mainnet
    wallet as any,
    undefined // explicitly pass undefined for creds
  );

  const credentials = await client.createOrDeriveApiKey();

  return credentials as ApiCredentials;
}

async function updateEnvFile(credentials: ApiCredentials): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  const lines = envContent.split('\n');
  const updatedLines: string[] = [];
  let foundApiKey = false;
  let foundSecret = false;
  let foundPassphrase = false;

  for (const line of lines) {
    if (line.startsWith('POLYMARKET_API_KEY=')) {
      updatedLines.push(`POLYMARKET_API_KEY=${credentials.key}`);
      foundApiKey = true;
    } else if (line.startsWith('POLYMARKET_API_SECRET=')) {
      updatedLines.push(`POLYMARKET_API_SECRET=${credentials.secret}`);
      foundSecret = true;
    } else if (line.startsWith('POLYMARKET_API_PASSPHRASE=')) {
      updatedLines.push(`POLYMARKET_API_PASSPHRASE=${credentials.passphrase}`);
      foundPassphrase = true;
    } else {
      updatedLines.push(line);
    }
  }

  if (!foundApiKey) {
    updatedLines.push(`POLYMARKET_API_KEY=${credentials.key}`);
  }
  if (!foundSecret) {
    updatedLines.push(`POLYMARKET_API_SECRET=${credentials.secret}`);
  }
  if (!foundPassphrase) {
    updatedLines.push(`POLYMARKET_API_PASSPHRASE=${credentials.passphrase}`);
  }

  fs.writeFileSync(envPath, updatedLines.join('\n'));
  console.log('\n✅ Updated .env file with API credentials');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   Polymarket API Credential Setup');
  console.log('═══════════════════════════════════════════════════════\n');

  let privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!privateKey) {
    console.log('⚠️  POLYMARKET_PRIVATE_KEY not found in .env file\n');
    privateKey = await question('Enter your private key (starting with 0x): ');
  } else {
    console.log('✅ Found POLYMARKET_PRIVATE_KEY in .env file\n');
  }

  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }

  try {
    const credentials = await deriveApiCredentials(privateKey);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   🎉 API Credentials Generated Successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Your API Credentials:\n');
    console.log(`API Key:        ${credentials.key}`);
    console.log(`Secret:         ${credentials.secret}`);
    console.log(`Passphrase:     ${credentials.passphrase}`);
    console.log('\n');

    const answer = await question('Would you like to automatically update your .env file? (y/n): ');

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      await updateEnvFile(credentials);
    } else {
      console.log('\n📝 Add these to your .env file manually:\n');
      console.log(`POLYMARKET_API_KEY=${credentials.key}`);
      console.log(`POLYMARKET_API_SECRET=${credentials.secret}`);
      console.log(`POLYMARKET_API_PASSPHRASE=${credentials.passphrase}`);
    }

    console.log('\n✨ Setup complete! You can now use live trading mode.\n');
  } catch (error) {
    console.error('\n❌ Error generating API credentials:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
