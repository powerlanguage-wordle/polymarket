# API Credential Setup Script

This script automatically generates Polymarket API credentials from your wallet's private key.

## What It Does

According to Polymarket's [authentication documentation](https://docs.polymarket.com/api-reference/authentication), the API uses a two-level authentication system:

1. **L1 Authentication** - Your wallet's private key
2. **L2 Authentication** - API credentials (apiKey, secret, passphrase) derived from L1

This script uses your private key to derive the L2 API credentials through Polymarket's CLOB API.

## Usage

### Option 1: Using .env file (Recommended)

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

### Option 2: Manual entry

1. Run the setup script without a private key in `.env`:
   ```bash
   npm run setup
   ```

2. Enter your private key when prompted

3. The script will generate and display your credentials

## What You Get

After running the script, you'll receive three credentials:

- **API Key** - Public identifier for your API access
- **Secret** - Used to sign API requests (keep secure!)
- **Passphrase** - Additional authentication factor

These credentials are automatically added to your `.env` file:

```bash
POLYMARKET_API_KEY=550e8400-e29b-41d4-a716-446655440000
POLYMARKET_API_SECRET=base64EncodedSecretString==
POLYMARKET_API_PASSPHRASE=randomPassphraseString
```

## Security Notes

⚠️ **Important:**
- Never commit your `.env` file to version control
- Keep your private key secure
- The script only communicates with Polymarket's official API
- Your private key never leaves your machine
- API credentials are derived deterministically (running the script multiple times with the same key returns the same credentials)

## Troubleshooting

### "Invalid private key"
Ensure your private key:
- Starts with `0x` (the script will add it if missing)
- Is 64 hexadecimal characters (+ 0x prefix)

### "Network error"
Check your internet connection. The script needs to connect to:
- `https://clob.polymarket.com` (Polymarket CLOB API)

### "Failed to derive credentials"
- Verify your private key is correct
- Ensure you have network connectivity
- Try again in a few moments (API might be temporarily unavailable)

## Next Steps

After obtaining your API credentials:

1. Verify they're in your `.env` file
2. Set `EXECUTION_MODE=live` in `.env` or `"mode": "live"` in `config.json`
3. Start the bot: `npm start`

## Technical Details

The script uses:
- `@polymarket/clob-client` - Official Polymarket CLOB client
- `ethers` - Ethereum wallet management
- EIP-712 signing for authentication

The credential derivation process:
1. Creates an ethers Wallet from your private key
2. Initializes ClobClient with the wallet
3. Calls `createOrDeriveApiKey()` which:
   - Signs an EIP-712 message with your private key
   - Sends it to Polymarket's `/auth/derive-api-key` endpoint
   - Receives deterministic API credentials based on your wallet address

## References

- [Polymarket Authentication Docs](https://docs.polymarket.com/api-reference/authentication)
- [CLOB Client TypeScript](https://github.com/Polymarket/clob-client)
- [EIP-712 Signing](https://eips.ethereum.org/EIPS/eip-712)
