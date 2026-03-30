# Scripts

This directory contains utility scripts for managing the Polymarket Copy Trading Bot.

## Available Scripts

### 1. API Credential Setup (`setup-api-credentials.ts`)

Automatically generates Polymarket API credentials from your wallet's private key.

**Usage:**
```bash
npm run setup
```

**What It Does:**

According to Polymarket's [authentication documentation](https://docs.polymarket.com/api-reference/authentication), the API uses a two-level authentication system:

1. **L1 Authentication** - Your wallet's private key
2. **L2 Authentication** - API credentials (apiKey, secret, passphrase) derived from L1

This script uses your private key to derive the L2 API credentials through Polymarket's CLOB API.

**Options:**

**Option A: Using .env file (Recommended)**

1. Add your private key to `.env`:
   ```bash
   POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...
   ```

2. Run the setup script:
   ```bash
   npm run setup
   ```

3. The script will:
   - Read your private key from `.env`
   - Derive API credentials from Polymarket
   - Display the credentials
   - Optionally update your `.env` file automatically

**Option B: Manual entry**

1. Run the setup script without a private key in `.env`:
   ```bash
   npm run setup
   ```

2. Enter your private key when prompted

3. The script will generate and display your credentials

### 2. Reset Paper Trading (`reset-paper-trading.ts`)

Resets all paper trading data to start fresh with a clean slate.

**Usage:**
```bash
npm run reset
```

**What It Deletes:**
- ✅ All positions (open and closed)
- ✅ All execution logs
- ✅ All copy decisions
- ✅ Marks all trades as unprocessed

**When To Use:**
- Starting fresh with paper trading
- Testing different strategies
- After changing configuration settings
- After major code changes

**Safety Features:**
- Requires confirmation before deleting
- Uses database transactions (all-or-nothing)
- Rolls back on error
- Only affects paper trading data (keeps trade history for reference)

**Example:**
```bash
$ npm run reset

🔄 RESET PAPER TRADING DATA

⚠️  This will DELETE the following data:
   - All positions (open and closed)
   - All execution logs
   - All copy decisions
   - Mark all trades as unprocessed

📝 This is useful for:
   - Starting fresh with paper trading
   - Testing different strategies
   - Resetting after configuration changes

Are you sure you want to reset? (yes/no): yes

🗑️  Deleting old data...
   ✅ Deleted 15 positions
   ✅ Deleted 23 execution logs
   ✅ Deleted 45 copy decisions
   ✅ Reset 50 trades to unprocessed

✨ Paper trading data has been reset successfully!
   You can now restart the bot with a clean slate.
```

## Security Notes

⚠️ **Important:**
- Never commit your `.env` file to version control
- Keep your private key secure
- Scripts only communicate with official Polymarket APIs
- Your private key never leaves your machine
- API credentials are derived deterministically

## Troubleshooting

### API Setup Issues

**"Invalid private key"**
- Ensure your private key starts with `0x`
- Must be 64 hexadecimal characters (+ 0x prefix)

**"Network error"**
- Check your internet connection
- Verify `https://clob.polymarket.com` is accessible

### Reset Issues

**"Connection error"**
- Check your `DATABASE_URL` in `.env`
- Ensure database is running and accessible

**"Transaction failed"**
- Database connection interrupted
- Data will NOT be deleted (automatic rollback)

## Technical Details

### API Credential Derivation
- Uses `@polymarket/clob-client` - Official Polymarket CLOB client
- Uses `ethers` - Ethereum wallet management
- EIP-712 signing for authentication

Process:
1. Creates an ethers Wallet from your private key
2. Initializes ClobClient with the wallet
3. Calls `createOrDeriveApiKey()` which:
   - Signs an EIP-712 message with your private key
   - Sends it to Polymarket's `/auth/derive-api-key` endpoint
   - Receives deterministic API credentials based on your wallet address

### Reset Process
- Uses PostgreSQL transactions for safety
- Deletes data in correct order (respects foreign keys)
- Automatic rollback on any error
- Requires explicit confirmation

## References

- [Polymarket Authentication Docs](https://docs.polymarket.com/api-reference/authentication)
- [CLOB Client TypeScript](https://github.com/Polymarket/clob-client)
- [EIP-712 Signing](https://eips.ethereum.org/EIPS/eip-712)
