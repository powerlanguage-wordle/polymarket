# Trade Aggregation Feature

## Overview

The trade aggregation feature solves the problem of partial fills in large orders. When traders place large orders on Polymarket, they often get executed as multiple smaller trades. Without aggregation, the bot would:

- Process each small trade separately
- Potentially reject trades that are individually too small
- Execute many tiny positions instead of one large one
- Waste gas and incur multiple trading fees

With aggregation enabled, the bot intelligently combines related trades into a single execution.

## How It Works

### 1. Trade Detection
When the bot detects a new trade from a tracked trader, instead of immediately processing it, the trade enters an aggregation window.

### 2. Grouping Logic
Trades are grouped by:
- **Trader address** (same trader)
- **Market** (same prediction market)
- **Outcome** (same side of the market)
- **Side** (BUY or SELL)

### 3. Time Window
All trades within the same group are held for a configurable time window (default: 30 seconds). During this window:
- New matching trades are added to the group
- The oldest trade's expiration time determines when the group is processed
- The aggregator periodically checks for expired groups

### 4. Aggregation
When a group's time window expires, all trades in the group are combined:
- **Size**: Sum of all individual trade sizes
- **Price**: Weighted average price (total value ÷ total size)
- **Timestamp**: Most recent trade's timestamp
- **ID**: Combined identifier for traceability

### 5. Execution
The bot then executes ONE trade with the aggregated size and price.

## Configuration

In `config.json`:

```json
{
  "execution": {
    "tradeAggregation": {
      "enabled": true,     // Enable/disable the feature
      "windowMs": 30000    // Time window in milliseconds (30s)
    }
  }
}
```

### Recommended Settings

- **Active traders with large orders**: `windowMs: 30000` (30 seconds)
- **Conservative traders**: `windowMs: 60000` (60 seconds)
- **Disable aggregation**: `enabled: false`

## Example Scenarios

### Scenario 1: Large Order Split Across Multiple Fills

**Without Aggregation:**
```
10:00:01 - Detected: BUY 25 shares @ $0.52 → Execute? ❌ Below minimum (100)
10:00:03 - Detected: BUY 40 shares @ $0.51 → Execute? ❌ Below minimum (100)  
10:00:05 - Detected: BUY 60 shares @ $0.53 → Execute? ❌ Below minimum (100)
10:00:08 - Detected: BUY 80 shares @ $0.52 → Execute? ❌ Below minimum (100)

Result: 4 rejected trades, total missed opportunity = 205 shares
```

**With Aggregation (30s window):**
```
10:00:01 - Detected: BUY 25 shares @ $0.52 → Added to group
10:00:03 - Detected: BUY 40 shares @ $0.51 → Added to group
10:00:05 - Detected: BUY 60 shares @ $0.53 → Added to group
10:00:08 - Detected: BUY 80 shares @ $0.52 → Added to group
10:00:31 - Window expired → Aggregate & Execute!

📦 [AGGREGATED] BUY 205 shares @ $0.5198 (weighted avg)
✅ Executed successfully!

Calculation:
  Total value = (25 × 0.52) + (40 × 0.51) + (60 × 0.53) + (80 × 0.52)
              = 13.00 + 20.40 + 31.80 + 41.60
              = 106.60
  Total size = 205
  Weighted avg price = 106.60 ÷ 205 = $0.5198
```

### Scenario 2: Single Large Trade

**Behavior:**
```
10:00:01 - Detected: BUY 500 shares @ $0.55 → Added to group
10:00:31 - Window expired → Only 1 trade in group
           
BUY 500 shares @ $0.55
✅ Executed (no aggregation needed)
```

The aggregator is smart enough to recognize when only one trade exists in a group and passes it through unchanged.

## Benefits

### ✅ Capital Efficiency
Execute one $500 trade instead of five $100 trades, better utilizing your capital allocation.

### ✅ Reduced Validation Failures
Trades that are individually below the minimum threshold can pass when aggregated.

### ✅ Lower Costs
One execution = one set of gas fees + trading fees, instead of multiple.

### ✅ True Intent Capture
Better represents what the tracked trader actually intended (full order size).

### ✅ Reduced Noise
Cleaner logs and easier monitoring with fewer duplicate entries.

## Monitoring

When aggregation is enabled, you'll see different log messages:

**Individual trade detected:**
```
🔔 NEW TRADE DETECTED (Polling): 0x9d84ce0306... | Yes | BUY 50 @ $0.5200
```

**Aggregated trade emitted:**
```
🔔 NEW TRADE DETECTED (Polling): 📦 [AGGREGATED] 0x9d84ce0306... | Yes | BUY 225 @ $0.5198
```

The `📦 [AGGREGATED]` indicator shows that multiple trades were combined.

## Technical Details

### Files Modified/Created

1. **`src/monitor/TradeAggregator.ts`** (NEW)
   - Core aggregation logic
   - Time-window based grouping
   - Weighted average price calculation

2. **`src/monitor/TradeMonitor.ts`** (MODIFIED)
   - Integration with TradeAggregator
   - Flush intervals for expired groups
   - Configurable enable/disable

3. **`src/types/index.ts`** (MODIFIED)
   - Added `tradeAggregation` config type

4. **`config.json` and `config.example.json`** (MODIFIED)
   - Added aggregation configuration

### Key Methods

```typescript
class TradeAggregator {
  // Add trade to aggregation pool
  addTrade(trade: Trade): Trade | null
  
  // Force flush all pending (used on shutdown)
  flushAll(): Trade[]
  
  // Get pending trade count
  getPendingCount(): number
  
  // Stop aggregator and cleanup
  stop(): void
}
```

## Troubleshooting

### Issue: Trades not aggregating
**Check:**
1. Is `enabled: true` in config?
2. Is the `windowMs` too short? Try increasing to 60000 (60s)
3. Are the trades on the same market and side?
4. Check logs for aggregation window messages

### Issue: Delayed executions
**Expected behavior!** Aggregation introduces intentional delay (default 30s) to collect related trades. This is the tradeoff for better capital efficiency.

If you need immediate execution, set `enabled: false`.

### Issue: Weighted average price differs from individual trades
**Expected behavior!** The weighted average considers trade size, so larger fills have more influence on the final price.

## When to Disable

Consider disabling aggregation (`enabled: false`) when:
- Tracking traders who rarely split orders
- You prefer immediate execution over capital efficiency
- You're testing with small capital where aggregation doesn't add value
- You want to copy every individual trade exactly as-is

## Performance Impact

- **Memory**: Minimal (LRU cache for processed trades, temporary storage for pending aggregations)
- **CPU**: Negligible (simple arithmetic for weighted averages)
- **Latency**: Intentional delay of `windowMs` milliseconds (default 30s)

The aggregator runs periodic cleanups every 10 seconds to ensure timely processing.
