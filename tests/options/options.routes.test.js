import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  captureApp,
  getApp,
  mockGetOptionsExpirations,
  mockGetOptionsChain,
} = vi.hoisted(() => {
  let _app = null;
  return {
    captureApp: (app) => {
      app.listen = () => {};   // prevent real port binding
      _app = app;
    },
    getApp: () => _app,
    mockGetOptionsExpirations: vi.fn(),
    mockGetOptionsChain:       vi.fn(),
  };
});

// ── Mock express to capture the app before app.listen ────────────────────────

vi.mock('express', async () => {
  const expressModule = await vi.importActual('express');
  const realExpress = expressModule.default ?? expressModule;

  const factory = function expressFactory() {
    const app = realExpress();
    captureApp(app);
    return app;
  };

  factory.Router     = realExpress.Router;
  factory.json       = realExpress.json;
  factory.urlencoded = realExpress.urlencoded;
  factory.static     = realExpress.static;
  factory.text       = realExpress.text;
  factory.raw        = realExpress.raw;

  return { default: factory };
});

// ── Auth middleware ───────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'test-user-123', tenantId: 'test-tenant' };
    next();
  },
}));

// ── Route files not under test ────────────────────────────────────────────────

vi.mock('../../routes/search.js',      () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/sentiment.js',   () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/userProfile.js', () => ({ default: (_req, _res, next) => next() }));

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('../../services/brokerService.js', () => ({
  getBrokerForUser:   vi.fn(),
  createAlpacaOrder:  vi.fn().mockResolvedValue({}),
  cancelAlpacaOrder:  vi.fn().mockResolvedValue({}),
  getAlpacaAccount:   vi.fn().mockResolvedValue({}),
  getAlpacaOrders:    vi.fn().mockResolvedValue([]),
  getAlpacaPositions: vi.fn().mockResolvedValue([]),
  getAlpacaQuote:     vi.fn().mockResolvedValue({}),
  createOandaOrder:   vi.fn().mockResolvedValue({}),
  getOandaAccount:    vi.fn().mockResolvedValue({}),
  getOandaPositions:  vi.fn().mockResolvedValue([]),
  getOandaPrice:      vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile:          vi.fn().mockResolvedValue({ tradingMode: 'paper' }),
  saveUserProfile:         vi.fn().mockResolvedValue({ success: true }),
  markOnboardingSkipped:   vi.fn().mockResolvedValue(undefined),
  markOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
  updateActiveStrategies:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/sentimentScheduler.js', () => ({
  startSentimentScheduler: vi.fn(),
}));

vi.mock('../../services/entityMetadata.js', () => ({
  attachEntityScope:     vi.fn((x) => x),
  attachEntityScopeList: vi.fn((x) => x),
}));

vi.mock('../../services/marketDataService.js', () => ({
  getFundamentals:   vi.fn().mockResolvedValue(null),
  getHistorical:     vi.fn().mockResolvedValue(null),
  getMarketNews:     vi.fn().mockResolvedValue({ feed: [] }),
  getMarketQuote:    vi.fn().mockResolvedValue(null),
  getMarketSnapshot: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/cache.js', () => ({
  buildCacheKey:  vi.fn().mockReturnValue('cache-key'),
  deleteCacheKey: vi.fn(),
}));

vi.mock('../../services/compressionService.js', () => ({
  compressFundamentals:       vi.fn().mockReturnValue(null),
  compressHistory:            vi.fn().mockReturnValue(null),
  compressPositions:          vi.fn().mockReturnValue([]),
  compressOrders:             vi.fn().mockReturnValue([]),
  compressSnapshot:           vi.fn().mockReturnValue([]),
  compressSentimentContext:   vi.fn().mockReturnValue(null),
  compressSentimentForClaude: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/sentimentDb.js', () => ({
  getLatestSnapshot:  vi.fn().mockResolvedValue(null),
  getSnapshotHistory: vi.fn().mockResolvedValue([]),
  getWatchList:       vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/contextResolver.js', () => ({
  resolveContext: vi.fn().mockReturnValue({ mode: 'single', symbol: null }),
}));

vi.mock('../../services/systemPrompts.js', () => ({
  getSingleSymbolPrompt: vi.fn().mockReturnValue('system prompt'),
  getMarketPrompt:       vi.fn().mockReturnValue('market prompt'),
}));

vi.mock('../../services/wheelDb.js', () => ({
  createPosition:      vi.fn().mockResolvedValue('pos-1'),
  updatePosition:      vi.fn().mockResolvedValue(undefined),
  getOpenPositions:    vi.fn().mockResolvedValue([]),
  getAllPositions:      vi.fn().mockResolvedValue([]),
  createCycle:         vi.fn().mockResolvedValue('cycle-1'),
  updateCycle:         vi.fn().mockResolvedValue(undefined),
  getActiveCycles:     vi.fn().mockResolvedValue([]),
  getAllCycles:         vi.fn().mockResolvedValue([]),
  updateMonthlyIncome: vi.fn().mockResolvedValue(undefined),
  getMonthlyIncome:    vi.fn().mockResolvedValue([]),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock() {
    this.messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock response' }],
      }),
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 0, output_tokens: 0 },
          stop_reason: 'end_turn',
          content: [],
        }),
      }),
    };
  }),
}));

// ── Env vars ──────────────────────────────────────────────────────────────────

process.env.ALPACA_LIVE_API_KEY    = 'test-live-key';
process.env.ALPACA_LIVE_SECRET_KEY = 'test-live-secret';

// ── Load server (registers routes; app is captured via express mock) ──────────

let app;
let brokerService;

beforeAll(async () => {
  await import('../../server.js');
  app           = getApp();
  brokerService = await import('../../services/brokerService.js');
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeMockBroker(overrides = {}) {
  return {
    getOptionsExpirations: mockGetOptionsExpirations,
    getOptionsChain:       mockGetOptionsChain,
    placeOptionsOrder:     vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Options routes — integration tests (server.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('Options routes — integration', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionsExpirations.mockResolvedValue(['2026-07-18', '2026-08-15']);
    mockGetOptionsChain.mockResolvedValue([
      { symbol: 'AAPL260718C00150000', contractType: 'call', strike: 150 },
    ]);
    brokerService.getBrokerForUser.mockResolvedValue(makeMockBroker());
  });

  // ── GET /api/options/expirations/:symbol ────────────────────────────────────

  describe('GET /api/options/expirations/:symbol', () => {

    it('calls broker.getOptionsExpirations with the uppercased symbol', async () => {
      const res = await request(app).get('/api/options/expirations/aapl');
      expect(res.status).toBe(200);
      expect(mockGetOptionsExpirations).toHaveBeenCalledWith('AAPL');
    });

    it('returns expirations array in response body', async () => {
      const res = await request(app).get('/api/options/expirations/AAPL');
      expect(res.body.expirations).toEqual(['2026-07-18', '2026-08-15']);
    });

    // NOTE: server.js returns HTTP 500 with a plain error field on adapter failure.
    it('returns 500 with error field when adapter throws', async () => {
      brokerService.getBrokerForUser.mockResolvedValue(
        makeMockBroker({
          getOptionsExpirations: vi.fn().mockRejectedValue(new Error('adapter error')),
        }),
      );

      const res = await request(app).get('/api/options/expirations/AAPL');
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    // NOTE: auth middleware is currently a dev stub (always sets req.user).
    // This test can be enabled once real JWT validation is wired in.
    it.todo('returns 401 without a valid token (blocked by dev-stub auth middleware)');
  });

  // ── GET /api/options/chain/:symbol ──────────────────────────────────────────

  describe('GET /api/options/chain/:symbol', () => {

    it('calls broker.getOptionsChain with correct symbol and expiration', async () => {
      const res = await request(app)
        .get('/api/options/chain/AAPL')
        .query({ expiration: '2026-07-18' });

      expect(res.status).toBe(200);
      expect(mockGetOptionsChain).toHaveBeenCalledWith(
        'AAPL',
        '2026-07-18',
        expect.any(Object),
      );
    });

    it('returns results array in response body', async () => {
      const res = await request(app)
        .get('/api/options/chain/AAPL')
        .query({ expiration: '2026-07-18' });

      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    // NOTE: server.js returns HTTP 500 with a plain error field on adapter failure.
    it('returns 500 with error field when adapter throws', async () => {
      brokerService.getBrokerForUser.mockResolvedValue(
        makeMockBroker({
          getOptionsChain: vi.fn().mockRejectedValue(new Error('adapter error')),
        }),
      );

      const res = await request(app)
        .get('/api/options/chain/AAPL')
        .query({ expiration: '2026-07-18' });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    it.todo('returns 401 without a valid token (blocked by dev-stub auth middleware)');
  });
});
