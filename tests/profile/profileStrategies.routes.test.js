import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

const {
  captureApp,
  getApp,
  mockUpdateActiveStrategies,
} = vi.hoisted(() => {
  let _app = null;
  return {
    captureApp: (app) => {
      app.listen = () => {};
      _app = app;
    },
    getApp: () => _app,
    mockUpdateActiveStrategies: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('express', async () => {
  const expressModule = await vi.importActual('express');
  const realExpress = expressModule.default ?? expressModule;

  const factory = function expressFactory() {
    const app = realExpress();
    captureApp(app);
    return app;
  };

  factory.Router = realExpress.Router;
  factory.json = realExpress.json;
  factory.urlencoded = realExpress.urlencoded;
  factory.static = realExpress.static;
  factory.text = realExpress.text;
  factory.raw = realExpress.raw;

  return { default: factory };
});

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'test-user-123', tenantId: 'test-tenant' };
    next();
  },
}));

vi.mock('../../routes/search.js', () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/sentiment.js', () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/userProfile.js', () => ({ default: (_req, _res, next) => next() }));

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile: vi.fn().mockResolvedValue({ tradingMode: 'paper' }),
  saveUserProfile: vi.fn().mockResolvedValue({ success: true }),
  markOnboardingSkipped: vi.fn().mockResolvedValue(undefined),
  markOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
  updateActiveStrategies: mockUpdateActiveStrategies,
}));

vi.mock('../../services/sentimentScheduler.js', () => ({
  startSentimentScheduler: vi.fn(),
}));

vi.mock('../../services/entityMetadata.js', () => ({
  attachEntityScope: vi.fn((x) => x),
  attachEntityScopeList: vi.fn((x) => x),
}));

vi.mock('../../services/brokerService.js', () => ({
  getBrokerForUser: vi.fn(),
  createAlpacaOrder: vi.fn().mockResolvedValue({}),
  cancelAlpacaOrder: vi.fn().mockResolvedValue({}),
  getAlpacaAccount: vi.fn().mockResolvedValue({}),
  getAlpacaOrders: vi.fn().mockResolvedValue([]),
  getAlpacaPositions: vi.fn().mockResolvedValue([]),
  getAlpacaQuote: vi.fn().mockResolvedValue({}),
  createOandaOrder: vi.fn().mockResolvedValue({}),
  getOandaAccount: vi.fn().mockResolvedValue({}),
  getOandaPositions: vi.fn().mockResolvedValue([]),
  getOandaPrice: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/marketDataService.js', () => ({
  getFundamentals: vi.fn().mockResolvedValue(null),
  getHistorical: vi.fn().mockResolvedValue(null),
  getMarketNews: vi.fn().mockResolvedValue({ feed: [] }),
  getMarketQuote: vi.fn().mockResolvedValue(null),
  getMarketSnapshot: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/cache.js', () => ({
  buildCacheKey: vi.fn().mockReturnValue('cache-key'),
  deleteCacheKey: vi.fn(),
}));

vi.mock('../../services/compressionService.js', () => ({
  compressFundamentals: vi.fn().mockReturnValue(null),
  compressHistory: vi.fn().mockReturnValue(null),
  compressPositions: vi.fn().mockReturnValue([]),
  compressOrders: vi.fn().mockReturnValue([]),
  compressSnapshot: vi.fn().mockReturnValue([]),
  compressSentimentContext: vi.fn().mockReturnValue(null),
  compressSentimentForClaude: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/sentimentDb.js', () => ({
  getLatestSnapshot: vi.fn().mockResolvedValue(null),
  getSnapshotHistory: vi.fn().mockResolvedValue([]),
  getWatchList: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/contextResolver.js', () => ({
  resolveContext: vi.fn().mockReturnValue({ mode: 'single', symbol: null }),
}));

vi.mock('../../services/systemPrompts.js', () => ({
  getSingleSymbolPrompt: vi.fn().mockReturnValue('system prompt'),
  getMarketPrompt: vi.fn().mockReturnValue('market prompt'),
}));

vi.mock('../../services/wheelDb.js', () => ({
  createPosition: vi.fn().mockResolvedValue('pos-1'),
  updatePosition: vi.fn().mockResolvedValue(undefined),
  getOpenPositions: vi.fn().mockResolvedValue([]),
  getAllPositions: vi.fn().mockResolvedValue([]),
  createCycle: vi.fn().mockResolvedValue('cycle-1'),
  updateCycle: vi.fn().mockResolvedValue(undefined),
  getActiveCycles: vi.fn().mockResolvedValue([]),
  getAllCycles: vi.fn().mockResolvedValue([]),
  updateMonthlyIncome: vi.fn().mockResolvedValue(undefined),
  getMonthlyIncome: vi.fn().mockResolvedValue([]),
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

process.env.ALPACA_LIVE_API_KEY = 'test-live-key';
process.env.ALPACA_LIVE_SECRET_KEY = 'test-live-secret';

let app;

beforeAll(async () => {
  await import('../../server.js');
  app = getApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateActiveStrategies.mockResolvedValue(undefined);
});

describe('PUT /api/profile/strategies', () => {
  it('calls updateActiveStrategies with userId, tenantId, and activeStrategies payload', async () => {
    const activeStrategies = ['wheel', 'momentum'];

    const res = await request(app)
      .put('/api/profile/strategies')
      .send({ activeStrategies });

    expect(res.status).toBe(200);
    expect(mockUpdateActiveStrategies).toHaveBeenCalledWith(
      'test-user-123',
      'test-tenant',
      activeStrategies,
    );
  });

  it('returns 200 on success', async () => {
    const res = await request(app)
      .put('/api/profile/strategies')
      .send({ activeStrategies: ['wheel'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 if updateActiveStrategies throws', async () => {
    mockUpdateActiveStrategies.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await request(app)
      .put('/api/profile/strategies')
      .send({ activeStrategies: ['wheel'] });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update strategies');
  });
});
