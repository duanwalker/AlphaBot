import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ────────────────────────────────────────────────────

const { mockGetUserProfile } = vi.hoisted(() => ({
  mockGetUserProfile: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile: mockGetUserProfile,
}));

vi.mock('../../brokers/brokerFactory.js', () => ({
  createBrokerAdapter: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { getBrokerForUser } from '../../services/brokerService.js';
import { AlpacaAdapter } from '../../brokers/AlpacaAdapter.js';
import { BrokerInterface } from '../../brokers/BrokerInterface.js';
import { SchwabAdapter } from '../../brokers/SchwabAdapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOk(jsonBody) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(jsonBody),
    text: () => Promise.resolve(''),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getBrokerForUser
// ─────────────────────────────────────────────────────────────────────────────

describe('getBrokerForUser', () => {
  beforeEach(() => {
    mockGetUserProfile.mockResolvedValue({ tradingMode: 'paper' });
  });

  it('returns an object with a getOptionsChain method', async () => {
    const broker = await getBrokerForUser('user-1', 'tenant-1');
    expect(typeof broker.getOptionsChain).toBe('function');
  });

  it('returns an object with getOptionsExpirations and placeOptionsOrder methods', async () => {
    const broker = await getBrokerForUser('user-1', 'tenant-1');
    expect(typeof broker.getOptionsExpirations).toBe('function');
    expect(typeof broker.placeOptionsOrder).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOptionsExpirations
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.getOptionsExpirations', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  it('returns a sorted string array with no duplicates', async () => {
    global.fetch = mockFetchOk({
      option_contracts: [
        { expiration_date: '2026-08-15' },
        { expiration_date: '2026-07-18' },
        { expiration_date: '2026-07-18' },
        { expiration_date: '2026-09-19' },
        { expiration_date: '2026-06-20' },
      ],
    });

    const result = await adapter.getOptionsExpirations('AAPL');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(new Set(result).size);
    expect(result).toEqual([...result].sort());
  });

  it('includes at least one date beyond July 2026', async () => {
    global.fetch = mockFetchOk({
      option_contracts: [
        { expiration_date: '2026-07-18' },
        { expiration_date: '2026-08-15' },
        { expiration_date: '2026-09-19' },
        { expiration_date: '2026-12-18' },
      ],
    });

    const result = await adapter.getOptionsExpirations('AAPL');
    expect(result.some((d) => d > '2026-07-31')).toBe(true);
  });

  it('returns empty array when no contracts are returned', async () => {
    global.fetch = mockFetchOk({ option_contracts: [] });
    const result = await adapter.getOptionsExpirations('AAPL');
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOptionsChain
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.getOptionsChain', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  it('contractType is lowercase call or put', async () => {
    global.fetch = mockFetchOk({
      snapshots: {
        'AAPL260718C00150000': {
          latestQuote: { ap: 5.50, bp: 5.30 },
          latestTrade: { p: 5.40, s: 10 },
          greeks: { delta: 0.45, gamma: 0.02, theta: -0.05, vega: 0.20 },
          impliedVolatility: 0.32,
          openInterest: 500,
        },
        'AAPL260718P00150000': {
          latestQuote: { ap: 3.00, bp: 2.80 },
          latestTrade: { p: 2.90, s: 5 },
          greeks: { delta: -0.55, gamma: 0.02, theta: -0.04, vega: 0.18 },
          impliedVolatility: 0.30,
          openInterest: 300,
        },
      },
    });

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');

    expect(result.length).toBeGreaterThan(0);
    result.forEach((c) => {
      expect(['call', 'put']).toContain(c.contractType);
    });
  });

  it('strike is a number', async () => {
    global.fetch = mockFetchOk({
      snapshots: {
        'AAPL260718C00150000': {
          latestQuote: { ap: 5.50, bp: 5.30 },
          latestTrade: { p: 5.40, s: 10 },
          greeks: { delta: 0.45, gamma: 0.02, theta: -0.05, vega: 0.20 },
          impliedVolatility: 0.32,
          openInterest: 500,
        },
      },
    });

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    expect(typeof result[0].strike).toBe('number');
    expect(result[0].strike).toBe(150);
  });

  it('greeks object has delta, gamma, theta, and vega', async () => {
    global.fetch = mockFetchOk({
      snapshots: {
        'AAPL260718C00150000': {
          latestQuote: { ap: 5.50, bp: 5.30 },
          latestTrade: { p: 5.40, s: 10 },
          greeks: { delta: 0.45, gamma: 0.02, theta: -0.05, vega: 0.20, rho: 0.01 },
          impliedVolatility: 0.32,
          openInterest: 500,
        },
      },
    });

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    const greeks = result[0].greeks;
    expect(greeks).toBeDefined();
    expect(typeof greeks.delta).toBe('number');
    expect(typeof greeks.gamma).toBe('number');
    expect(typeof greeks.theta).toBe('number');
    expect(typeof greeks.vega).toBe('number');
  });

  it('returns empty array on empty snapshots', async () => {
    global.fetch = mockFetchOk({ snapshots: {} });
    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    expect(result).toEqual([]);
  });

  it('returns empty array on fetch error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// placeOptionsOrder
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.placeOptionsOrder', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  function mockOrderResponse(overrides = {}) {
    return mockFetchOk({
      id: 'order-abc',
      status: 'accepted',
      symbol: 'AAPL260718P00150000',
      side: 'sell',
      qty: '1',
      filled_at: null,
      ...overrides,
    });
  }

  it('sell_to_open maps to side:sell and position_intent:open', async () => {
    global.fetch = mockOrderResponse({ side: 'sell' });

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'sell_to_open',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.side).toBe('sell');
    expect(body.position_intent).toBe('open');
  });

  it('buy_to_close maps to side:buy and position_intent:close', async () => {
    global.fetch = mockOrderResponse({ side: 'buy' });

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'buy_to_close',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.side).toBe('buy');
    expect(body.position_intent).toBe('close');
  });

  it('limit_price is absent for market orders', async () => {
    global.fetch = mockOrderResponse();

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'buy_to_open',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.limit_price).toBeUndefined();
  });

  it('limit_price is included for limit orders', async () => {
    global.fetch = mockOrderResponse();

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'buy_to_open',
      qty: 1,
      orderType: 'limit',
      limitPrice: 4.50,
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.limit_price).toBe('4.5');
  });

  it('returns normalized order result', async () => {
    global.fetch = mockFetchOk({
      id: 'order-xyz',
      status: 'accepted',
      symbol: 'AAPL260718P00150000',
      side: 'sell',
      qty: '2',
      filled_at: null,
    });

    const result = await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'sell_to_open',
      qty: 2,
      orderType: 'market',
      timeInForce: 'day',
    });

    expect(result.orderId).toBe('order-xyz');
    expect(result.status).toBe('accepted');
    expect(result.qty).toBe(2);
    expect(result.filledAt).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADDED TESTS — gap-fill (not part of the original 15)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// getBrokerForUser — explicit non-null contract
// ─────────────────────────────────────────────────────────────────────────────

describe('getBrokerForUser — return value is not null', () => {
  beforeEach(() => {
    mockGetUserProfile.mockResolvedValue({ tradingMode: 'paper' });
  });

  it('returns an object (not null, not undefined)', async () => {
    const broker = await getBrokerForUser('user-1', 'tenant-1');
    expect(broker).toBeDefined();
    expect(broker).not.toBeNull();
    expect(typeof broker).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BrokerInterface stubs — base class throws on all options methods
// ─────────────────────────────────────────────────────────────────────────────

describe('BrokerInterface stubs', () => {
  let base;

  beforeEach(() => {
    base = new BrokerInterface();
  });

  it('getOptionsExpirations() throws when called on base class directly', async () => {
    await expect(base.getOptionsExpirations('AAPL')).rejects.toThrow();
  });

  it('getOptionsChain() throws when called on base class directly', async () => {
    await expect(base.getOptionsChain('AAPL', '2026-07-18')).rejects.toThrow();
  });

  it('placeOptionsOrder() throws when called on base class directly', async () => {
    await expect(base.placeOptionsOrder({})).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AlpacaAdapter.getOptionsExpirations — gap coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.getOptionsExpirations — additional', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  it('all entries are strings in YYYY-MM-DD format', async () => {
    global.fetch = mockFetchOk({
      option_contracts: [
        { expiration_date: '2026-07-18' },
        { expiration_date: '2026-08-15' },
        { expiration_date: '2026-09-19' },
      ],
    });

    const result = await adapter.getOptionsExpirations('AAPL');
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    expect(result.length).toBeGreaterThan(0);
    result.forEach((d) => {
      expect(typeof d).toBe('string');
      expect(d).toMatch(dateRegex);
    });
  });

  it('sends expiration_date_gte in the request URL', async () => {
    global.fetch = mockFetchOk({ option_contracts: [] });

    await adapter.getOptionsExpirations('AAPL');

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('expiration_date_gte=');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AlpacaAdapter.getOptionsChain — gap coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.getOptionsChain — additional', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  it('bid, ask, and last are all numbers', async () => {
    global.fetch = mockFetchOk({
      snapshots: {
        'AAPL260718C00150000': {
          latestQuote: { ap: 5.50, bp: 5.30 },
          latestTrade: { p: 5.40, s: 10 },
          greeks: { delta: 0.45, gamma: 0.02, theta: -0.05, vega: 0.20 },
          impliedVolatility: 0.32,
          openInterest: 500,
        },
      },
    });

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0].bid).toBe('number');
    expect(typeof result[0].ask).toBe('number');
    expect(typeof result[0].last).toBe('number');
  });

  it('returns [] when fetch rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await adapter.getOptionsChain('AAPL', '2026-07-18');
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AlpacaAdapter.placeOptionsOrder — gap coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('AlpacaAdapter.placeOptionsOrder — additional', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AlpacaAdapter({
      apiKey: 'test-key',
      secretKey: 'test-secret',
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  });

  function mockOrderResponse(overrides = {}) {
    return mockFetchOk({
      id: 'order-abc',
      status: 'accepted',
      symbol: 'AAPL260718C00150000',
      side: 'buy',
      qty: '1',
      filled_at: null,
      ...overrides,
    });
  }

  it('buy_to_open maps to side:buy and position_intent:open', async () => {
    global.fetch = mockOrderResponse({ side: 'buy' });

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718C00150000',
      side: 'buy_to_open',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.side).toBe('buy');
    expect(body.position_intent).toBe('open');
  });

  it('sell_to_close maps to side:sell and position_intent:close', async () => {
    global.fetch = mockOrderResponse({ side: 'sell' });

    await adapter.placeOptionsOrder({
      symbol: 'AAPL260718P00150000',
      side: 'sell_to_close',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.side).toBe('sell');
    expect(body.position_intent).toBe('close');
  });

  it('return shape includes symbol and side', async () => {
    global.fetch = mockFetchOk({
      id: 'order-xyz',
      status: 'accepted',
      symbol: 'AAPL260718C00150000',
      side: 'buy',
      qty: '1',
      filled_at: null,
    });

    const result = await adapter.placeOptionsOrder({
      symbol: 'AAPL260718C00150000',
      side: 'buy_to_open',
      qty: 1,
      orderType: 'market',
      timeInForce: 'day',
    });

    expect(result.symbol).toBe('AAPL260718C00150000');
    expect(typeof result.side).toBe('string');
    expect(['buy', 'sell']).toContain(result.side);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SchwabAdapter
// ─────────────────────────────────────────────────────────────────────────────

describe('SchwabAdapter', () => {
  it('instantiates without throwing', () => {
    expect(() => new SchwabAdapter()).not.toThrow();
  });

  it('getOptionsExpirations throws with "not yet implemented"', async () => {
    const adapter = new SchwabAdapter();
    await expect(adapter.getOptionsExpirations('AAPL')).rejects.toThrow(/not yet implemented/i);
  });

  it('getOptionsChain throws with "not yet implemented"', async () => {
    const adapter = new SchwabAdapter();
    await expect(adapter.getOptionsChain('AAPL', '2026-07-18')).rejects.toThrow(/not yet implemented/i);
  });

  it('placeOptionsOrder throws with "not yet implemented"', async () => {
    const adapter = new SchwabAdapter();
    await expect(adapter.placeOptionsOrder({})).rejects.toThrow(/not yet implemented/i);
  });
});
