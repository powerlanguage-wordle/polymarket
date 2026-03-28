import { TraderValidator } from '../dist/validation/validators/TraderValidator';
import { SizeValidator } from '../dist/validation/validators/SizeValidator';
import type { Config, Trade } from '../dist/types';

const mockConfig: Config = {
  trackedTraders: ['0x1234567890123456789012345678901234567890', '0xabcdef1234567890123456789012345678901234'],
  riskParams: {
    minTradeSize: 100,
    maxCapitalPerTrade: 0.05,
    maxSlippage: 0.05,
    maxPositions: 10,
    maxMarketExposure: 0.20,
  },
  execution: {
    mode: 'paper',
    pollInterval: 15000,
    retryAttempts: 3,
    retryDelayMs: 1000,
  },
  polymarket: {
    clobApiUrl: 'https://clob.polymarket.com',
    chainId: 137,
    feeRateBps: 200,
  },
  database: {
    path: ':memory:',
  },
  logging: {
    level: 'error',
    directory: './logs',
    maxFiles: 10,
    maxSize: '20m',
  },
};

const mockTrade: Trade = {
  id: 'test-trade-123',
  trader: '0x1234567890123456789012345678901234567890',
  market: 'test-market',
  outcome: 'YES',
  side: 'BUY',
  price: 0.6,
  size: 200,
  timestamp: Date.now(),
};

describe('TraderValidator', () => {
  let validator: TraderValidator;

  beforeEach(() => {
    validator = new TraderValidator(mockConfig);
  });

  test('should accept whitelisted trader', () => {
    const result = validator.validate('0x1234567890123456789012345678901234567890');
    expect(result.valid).toBe(true);
  });

  test('should accept whitelisted trader case-insensitive', () => {
    const result = validator.validate('0X1234567890123456789012345678901234567890');
    expect(result.valid).toBe(true);
  });

  test('should reject non-whitelisted trader', () => {
    const result = validator.validate('0x9999999999999999999999999999999999999999');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not in the tracked traders list');
  });

  test('should handle isWhitelisted method', () => {
    expect(validator.isWhitelisted('0x1234567890123456789012345678901234567890')).toBe(true);
    expect(validator.isWhitelisted('0xabcdef1234567890123456789012345678901234')).toBe(true);
    expect(validator.isWhitelisted('0x0000000000000000000000000000000000000000')).toBe(false);
  });
});

describe('SizeValidator', () => {
  let validator: SizeValidator;

  beforeEach(() => {
    validator = new SizeValidator(mockConfig);
  });

  test('should accept trade above minimum size', () => {
    const result = validator.validate(mockTrade);
    expect(result.valid).toBe(true);
  });

  test('should reject trade below minimum size', () => {
    const smallTrade = { ...mockTrade, size: 50 };
    const result = validator.validate(smallTrade);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('below minimum');
  });

  test('should consider trade value not just size', () => {
    const lowValueTrade = { ...mockTrade, size: 100, price: 0.1 };
    const result = validator.validate(lowValueTrade);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('value');
  });

  test('should accept trade with sufficient value', () => {
    const goodTrade = { ...mockTrade, size: 150, price: 0.5 };
    const result = validator.validate(goodTrade);
    expect(result.valid).toBe(true);
  });
});
