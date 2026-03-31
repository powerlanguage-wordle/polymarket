# Polymarket Copy Trading Bot

A production-ready automated trading bot that monitors selected Polymarket traders and replicates their trades with strict risk management and price discipline.

## 🚀 Features

- **Real-time Trade Monitoring** - WebSocket integration for instant trade detection with polling fallback
- **Trade Aggregation** - Automatically combines partial fills into single trades
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
    "retryDelayMs": 1000,
    "tradeAggregation": {          // Optional: aggregate partial fills
      "enabled": true,             // Combine trades within time window
      "windowMs": 30000            // 30-second aggregation window
    }
  },
  "polymarket": {
    "clobApiUrl": "https://clob.polymarket.com",
    "chainId": 137,
    "feeRateBps": 200
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
npm start
```

### Paper Trading (Recommended First)
1. Set `"mode": "paper"` in `config.json`
2. Run the bot and monitor logs in `logs/bot.log`
3. Review positions via the API at http://localhost:3001/api/stats/positions
4. Analyze performance and validation decisions

#### Reset Paper Trading Data
To start fresh with a clean slate (useful for testing or strategy changes):
```bash
npm run reset
```
This will delete all positions, execution logs, and copy decisions while keeping trade history for reference.

### Live Trading (⚠️ Real Money)
1. Ensure paper trading performs as expected
2. Add API credentials to `.env`
3. Set `"mode": "live"` in `config.json`
4. Start with small capital allocation
5. Monitor closely during first sessions

## 📊 How It Works

### Trade Aggregation (Handling Partial Fills)

When traders make large orders on Polymarket, they often get filled across multiple smaller trades (partial fills). The bot's trade aggregation feature automatically combines these partial fills:

**How it works:**
1. Bot detects individual trades from tracked traders
2. Trades are grouped by: trader + market + outcome + side
3. Within a configurable time window (default: 30 seconds), trades in the same group are held
4. When the window expires, all trades in the group are combined into one:
   - **Total size**: Sum of all individual trades
   - **Weighted average price**: Value-weighted average of all prices
   - **Single execution**: Bot executes one trade instead of many small ones

**Benefits:**
- ✅ Avoids many tiny trades that waste gas and incur multiple fees
- ✅ More accurate representation of trader's intent (full order size)
- ✅ Better capital utilization (one $500 trade vs. five $100 trades)
- ✅ Reduces validation failures from trades that are individually too small

**Example:**
```
Without aggregation:
  🔔 BUY 50 @ $0.52 → ❌ Rejected (below minimum 100)
  🔔 BUY 75 @ $0.51 → ❌ Rejected (below minimum 100)
  🔔 BUY 100 @ $0.53 → ✅ Executed

With aggregation (30s window):
  📦 [AGGREGATED] BUY 225 @ $0.52 → ✅ Executed (weighted average)
```

**Configuration:**
```json
"tradeAggregation": {
  "enabled": true,    // Enable/disable aggregation
  "windowMs": 30000   // Time window in milliseconds (30s default)
}
```

Set `enabled: false` to process every trade individually (not recommended for traders who make large orders).

### Core Loop
```
Monitor Trader Wallets
        ↓
Detect New Trade
        ↓
Trade Aggregation (if enabled)
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
│   │   └── StatsServer.ts       # Express API server for stats
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

**Access via API**: View positions and stats at http://localhost:3001/api/stats/*

## 🔍 Monitoring

### Logs
- `logs/bot.log` - All events (info, warn, error)
- `logs/error.log` - Errors only

### Health Check Endpoint

**Bot Health Check**:
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

## 📊 REST API

The bot exposes the following REST API endpoints:

- `GET /api/health` - Server health check
- `GET /api/stats/portfolio` - Portfolio summary (PnL, positions count, capital utilization)
- `GET /api/stats/positions` - List all open positions with details
- `GET /api/stats/overview` - Capital breakdown and market exposure

### Example Usage

```bash
# Get portfolio summary
curl http://localhost:3001/api/stats/portfolio

# Get all open positions
curl http://localhost:3001/api/stats/positions

# Get capital overview and market exposure
curl http://localhost:3001/api/stats/overview
```

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
- Check poll interval isn't too long (5-30s depending on your needs)
- Ensure API connectivity to Polymarket CLOB API

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

1. **Optimize Poll Interval** - Balance latency vs API rate limits
   - **5-10s**: Fast detection, good for 1-3 traders
   - **10-20s**: Balanced, recommended for most use cases  
   - **20-30s**: Conservative, good for many traders or API limits
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

- [ ] Telegram/Discord notifications improvements
- [ ] Advanced position sizing (Kelly Criterion)
- [ ] Auto-close positions based on PnL
- [ ] ML-based trader scoring
- [ ] Multi-chain support
- [ ] Backtesting framework

---

**Built with ❤️ for Polymarket traders**
