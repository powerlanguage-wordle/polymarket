# Polymarket Copy Trading Bot

A production-ready automated trading bot that monitors selected Polymarket traders and replicates their trades with strict risk management and price discipline.

## 🚀 Features

- **Real-time Trade Monitoring** - Polls Polymarket CLOB API every 10-30 seconds for trader activity
- **Web Dashboard** - Built-in UI for viewing portfolio stats, positions, and PnL in real-time
- **Multi-stage Validation** - Whitelist, size threshold, liquidity, and slippage checks
- **Smart Risk Management** - 2-5% capital per trade, max exposure limits, position sizing
- **Paper Trading Mode** - Test strategies safely before going live
- **Comprehensive Logging** - Winston-based logging with trade history and execution logs
- **Graceful Error Handling** - Automatic retries, circuit breakers, and safe shutdowns
- **PostgreSQL Database** - Persistent storage for positions, trades, and decisions (Render-compatible)
- **REST API** - Access portfolio stats programmatically via HTTP endpoints

## 📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database (Render provides free PostgreSQL databases)
- Polymarket API credentials (for live trading)
- Basic understanding of prediction markets

## 🛠️ Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Copy configuration files:**
   ```bash
   cp config.example.json config.json
   cp .env.example .env
   ```

3. **Set up PostgreSQL database:**
   - Sign up for [Render](https://render.com) (free tier available)
   - Create a new PostgreSQL database
   - Copy the DATABASE_URL connection string

4. **Configure your settings:**
   - Edit `config.json` with your tracked trader addresses and risk parameters
   - Edit `.env` with your DATABASE_URL and API credentials (for live trading)

## ⚙️ Configuration

### Step 1: Get API Credentials

Polymarket uses a two-level authentication system. You need to derive API credentials from your private key:

1. **Add your private key to `.env`:**
   ```bash
   cp .env.example .env
   # Edit .env and add your POLYMARKET_PRIVATE_KEY
   ```

2. **Run the setup script:**
   ```bash
   npm run setup
   ```
   
   This will automatically derive your API credentials (apiKey, secret, passphrase) and update your `.env` file. See [scripts/README.md](scripts/README.md) for details.

### Step 2: Configure Trading Parameters

### config.json

```json
{
  "trackedTraders": [
    "0x1234567890123456789012345678901234567890"
  ],
  "riskParams": {
    "minTradeSize": 100,           // Minimum trade size to copy
    "maxCapitalPerTrade": 0.05,    // Max 5% of capital per trade
    "maxSlippage": 0.05,           // Max 5% price movement allowed
    "maxPositions": 10,            // Maximum concurrent positions
    "maxMarketExposure": 0.20      // Max 20% exposure per market
  },
  "execution": {
    "mode": "paper",               // "paper" or "live"
    "pollInterval": 15000,         // Poll every 15 seconds
    "retryAttempts": 3,
    "retryDelayMs": 1000
  }
}
```

### .env

```bash
# Database (Required)
DATABASE_URL=postgresql://username:password@host.render.com:5432/dbname

# Step 1: Add your private key
POLYMARKET_PRIVATE_KEY=0x1234567890abcdef...

# Step 2: Run `npm run setup` to generate these:
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_API_SECRET=your_api_secret_here
POLYMARKET_API_PASSPHRASE=your_api_passphrase_here

# Optional overrides
EXECUTION_MODE=paper
POLL_INTERVAL_MS=15000
DASHBOARD_PORT=3001
LOG_LEVEL=info
```

**⚠️ Important:** Don't manually set the API credentials. Use `npm run setup` to derive them from your private key.

## 🚦 Usage

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure trading parameters
cp config.example.json config.json
# Edit config.json with your tracked trader addresses

# 3. Set up API credentials (for live trading)
cp .env.example .env
# Add your POLYMARKET_PRIVATE_KEY to .env
npm run setup  # Generates API credentials
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Build and Run Production
```bash
npm run build
npm run build:dashboard
npm start
```

### Paper Trading (Recommended First)
1. Set `"mode": "paper"` in `config.json`
2. Run the bot and monitor logs in `logs/bot.log`
3. Review positions via the web dashboard at http://localhost:3001
4. Analyze performance and validation decisions

### Live Trading (⚠️ Real Money)
1. Ensure paper trading performs as expected
2. Add API credentials to `.env`
3. Set `"mode": "live"` in `config.json`
4. Start with small capital allocation
5. Monitor closely during first sessions

## 📊 How It Works

### Core Loop
```
Monitor Trader Wallets
        ↓
Detect New Trade
        ↓
Normalize Data (market, outcome, price, size)
        ↓
Validation Pipeline:
  ├─ Trader Whitelisted?
  ├─ Size Above Threshold?
  ├─ Sufficient Liquidity?
  ├─ Slippage Within Limits?
  └─ Risk Limits OK?
        ↓
Calculate Position Size
        ↓
Execute Trade (Paper/Live)
        ↓
Log Results & Update Positions
        ↓
Repeat
```

### Validation Checks

1. **Trader Whitelist** - Only copy trades from configured addresses
2. **Size Threshold** - Ignore small trades below minimum
3. **Slippage Protection** - Reject if price moved >3-5% from entry
4. **Liquidity Check** - Ensure order book depth exists
5. **Risk Limits** - Enforce position sizing and exposure caps

## 📁 Project Structure

```
polymarket/
├── src/
│   ├── bot.ts                    # Main orchestration loop
│   ├── api/
│   │   └── StatsServer.ts       # Express web server for dashboard
│   ├── config/
│   │   └── index.ts             # Configuration management
│   ├── db/
│   │   └── schema.ts            # PostgreSQL schema and queries
│   ├── execution/
│   │   ├── PaperTrader.ts       # Simulated execution
│   │   ├── LiveTrader.ts        # Real order placement
│   │   └── PolymarketClient.ts  # CLOB API wrapper
│   ├── monitor/
│   │   ├── TradeMonitor.ts      # Polling and event emission
│   │   └── TradeNormalizer.ts   # Trade data normalization
│   ├── positions/
│   │   ├── PositionManager.ts   # Position tracking
│   │   └── TradeLogger.ts       # Database logging
│   ├── risk/
│   │   ├── CapitalCalculator.ts # Available capital
│   │   ├── ExposureTracker.ts   # Market exposure
│   │   ├── PositionSizer.ts     # Position sizing
│   │   └── RiskManager.ts       # Risk orchestration
│   ├── validation/
│   │   ├── ValidationPipeline.ts
│   │   └── validators/
│   │       ├── TraderValidator.ts
│   │       ├── SizeValidator.ts
│   │       ├── LiquidityChecker.ts
│   │       └── SlippageValidator.ts
│   ├── monitoring/
│   │   └── HealthChecker.ts     # System health
│   ├── utils/
│   │   └── logger.ts            # Winston logger
│   └── types/
│       └── index.ts             # TypeScript types
├── dashboard/                   # React web dashboard
│   ├── src/
│   │   ├── App.tsx              # Main dashboard UI
│   │   ├── api/
│   │   │   └── client.ts        # API client
│   │   └── components/          # React components
│   └── dist/                    # Built static files (served by bot)
├── test/                        # Jest tests
├── logs/                        # Log files
└── config.json                  # Bot configuration
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# View test coverage
npm test -- --coverage
```

## 📝 Database Schema

The bot uses PostgreSQL with the following tables:

- **trades** - All detected trades from monitored wallets
- **positions** - Open and closed positions
- **copy_decisions** - Validation results for each trade
- **execution_log** - Order execution history

**Access via Dashboard**: View positions and stats at http://localhost:3001

## 🔍 Monitoring

### Logs
- `logs/bot.log` - All events (info, warn, error)
- `logs/error.log` - Errors only

### Health Check Endpoint

**Dashboard/Bot Health Check** (http://localhost:3001):
```bash
curl http://localhost:3001/api/health
```
Returns `{"status": "ok", "timestamp": 1711699764000}`

### Health Monitoring
The bot automatically monitors:
- Trade detection activity
- API connectivity
- Memory usage
- Database access

## 📊 Web Dashboard

The bot includes a built-in web dashboard for visualizing your portfolio stats in real-time.

### Features
- **Portfolio Summary** - Total positions, portfolio value, PnL, and capital utilization
- **Capital Breakdown** - Visual breakdown of allocated vs. available capital
- **Market Exposure** - See how much capital is allocated to each market
- **Positions Table** - Detailed view of all open positions with PnL tracking
- **Manual Refresh** - Click the refresh button to update stats on demand

### Setup

1. **Build the dashboard** (required before first use):
   ```bash
   npm run build:dashboard
   ```

2. **Start the bot** (includes the dashboard server):
   ```bash
   npm run build
   npm start
   ```

3. **Access the dashboard**:
   Open your browser to [http://localhost:3001](http://localhost:3001)

### API Endpoints

The bot exposes the following REST API endpoints on port 3001:

- `GET /api/health` - Server health check
- `GET /api/stats/portfolio` - Portfolio summary (PnL, positions count, capital utilization)
- `GET /api/stats/positions` - List all open positions with details
- `GET /api/stats/overview` - Capital breakdown and market exposure

### Development

To develop the dashboard with hot-reload:
```bash
cd dashboard
npm run dev
```

The Vite dev server will start on port 3000 and proxy API requests to the bot on port 3001.

## ⚠️ Safety & Risk Management

### Paper Trading First
Always test in paper trading mode before risking real capital.

### Start Small
Begin with minimal capital allocation and gradually increase.

### Monitor Closely
Watch logs and positions during initial live sessions.

### Risk Limits
The bot enforces:
- Max 2-5% capital per trade
- Max 20% exposure per market
- Max 10 concurrent positions
- 3-5% slippage protection

### API Security
- Never commit `config.json` or `.env` to version control
- Store private keys securely
- Use environment variables in production

## 🐛 Troubleshooting

### No trades detected
- Verify tracked trader addresses are correct and active
- Check poll interval isn't too long
- Ensure API connectivity

### Trades rejected
- Review validation logs in database
- Check risk limits in config
- Verify market liquidity

### Execution failures
- Check API credentials (live mode)
- Review error logs
- Ensure sufficient balance

### High memory usage
- Reduce poll frequency
- Check for memory leaks
- Monitor position count

## 📈 Performance Tips

1. **Optimize Poll Interval** - Balance latency vs API rate limits (10-30s recommended)
2. **Selective Traders** - Track only proven profitable traders
3. **Size Filters** - Skip small trades to reduce noise
4. **Market Selection** - Focus on liquid markets
5. **Position Limits** - Don't over-diversify, maintain focus

## 🔧 Development

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

### Build
```bash
npm run build
```

## 📜 License

MIT

## ⚠️ Disclaimer

This bot is for educational purposes. Automated trading involves substantial risk. Past performance does not guarantee future results. Use at your own risk. The authors are not responsible for financial losses.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📚 Resources

- [Polymarket Documentation](https://docs.polymarket.com)
- [CLOB API Reference](https://docs.polymarket.com/#clob-api)
- [Prediction Markets Guide](https://en.wikipedia.org/wiki/Prediction_market)

## 💡 Future Enhancements

- [ ] Web dashboard for monitoring
- [ ] Telegram/Discord notifications
- [ ] Advanced position sizing (Kelly Criterion)
- [ ] Auto-close positions based on PnL
- [ ] ML-based trader scoring
- [ ] Multi-chain support
- [ ] Backtesting framework

---

**Built with ❤️ for Polymarket traders**
