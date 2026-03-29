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

### Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:

1. **Database URL (Required)**: Add your PostgreSQL connection string from Render:
   ```
   DATABASE_URL=postgresql://username:password@host.render.com:5432/dbname
   ```

2. **API Credentials** (Optional for Paper Trading, Required for Live):
   - Add your private key:
     ```
     POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...
     ```
   - Run the setup script to generate API credentials:
     ```bash
     npm run setup
     ```
     This will automatically derive and add your API credentials to `.env`

## Step 3: Build
```bash
npm run build
```

## Step 4: Build the Dashboard
```bash
npm run build:dashboard
```

## Step 5: Run the Bot (includes Dashboard)

The bot includes the dashboard server - everything runs in a single process:

### Development Mode (Recommended for Testing)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The dashboard will be available at: http://localhost:3001

## Step 6: Monitor

Watch the logs:
```bash
tail -f logs/bot.log
```

**Access the Dashboard**: Open http://localhost:3001 to view:
- Portfolio summary
- Open positions
- Capital allocation
- Real-time P&L

## Step 7: Go Live (when ready)

1. Make sure you've run `npm run setup` to generate API credentials
2. Edit `config.json` and set `"mode": "live"`
3. Start with small capital allocation
4. Start the bot (see Step 5)
5. Monitor closely!

## Common Commands

```bash
# Set up API credentials (required for live trading)
npm run setup

# Run tests
npm test

# Build TypeScript files
npm run build

# Build dashboard
npm run build:dashboard

# Development mode (bot + dashboard)
npm run dev

# Production mode (bot + dashboard)
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
