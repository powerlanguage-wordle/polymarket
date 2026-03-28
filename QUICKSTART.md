# Quick Start Guide

## Step 1: Install Dependencies
```bash
npm install
```

## Step 2: Configure the Bot

### Create config.json
```bash
cp config.example.json config.json
```

Edit `config.json` and add real trader addresses you want to track:
```json
{
  "trackedTraders": [
    "0xYourTrackedTraderAddress1",
    "0xYourTrackedTraderAddress2"
  ]
}
```

### Set Up API Credentials (Optional for Paper Trading, Required for Live)

```bash
cp .env.example .env
```

**For paper trading:** The default values work fine.

**For live trading:** 
1. Add your private key to `.env`:
   ```
   POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...
   ```
2. Run the setup script to generate API credentials:
   ```bash
   npm run setup
   ```
   This will automatically derive and add your API credentials to `.env`

## Step 3: Build
```bash
npm run build
```

## Step 4: Run in Paper Trading Mode
```bash
npm start
# or for development with auto-restart:
npm run dev
```

## Step 5: Monitor

Watch the logs:
```bash
tail -f logs/bot.log
```

Check the database:
```bash
sqlite3 data/bot.db "SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10"
```

## Step 6: Go Live (when ready)

1. Make sure you've run `npm run setup` to generate API credentials
2. Edit `config.json` and set `"mode": "live"`
3. Start with small capital allocation
4. Monitor closely!

## Common Commands

```bash
# Set up API credentials (required for live trading)
npm run setup

# Run tests
npm test

# Build
npm run build

# Development mode (auto-restart)
npm run dev

# Production mode
npm start

# Lint code
npm run lint

# Format code
npm run format
```

## Directory Structure After Running

```
polymarket/
├── data/
│   └── bot.db          # SQLite database with trades and positions
├── logs/
│   ├── bot.log         # All logs
│   └── error.log       # Errors only
├── dist/               # Compiled JavaScript
└── node_modules/       # Dependencies
```

## Troubleshooting

### "Configuration file not found"
→ Make sure you copied `config.example.json` to `config.json`

### "No trades detected"
→ Verify your tracked trader addresses are active Polymarket traders

### "POLYMARKET_API_KEY is required"
→ Run `npm run setup` to generate API credentials from your private key. Only needed for live mode.

## Next Steps

1. Run for a few hours in paper mode
2. Review the decisions in the database
3. Adjust risk parameters based on results
4. When comfortable, switch to live mode with small amounts
5. Scale up gradually

## Safety Reminders

- ✅ Always test in paper mode first
- ✅ Start with small capital allocation
- ✅ Monitor logs closely
- ✅ Set conservative risk limits
- ⚠️ Never commit private keys to git
- ⚠️ Understand the risks before going live
