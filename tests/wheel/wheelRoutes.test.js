import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

// ── Hoisted mocks (available inside vi.mock factories) ────────────────────────

const {
  captureApp,
  getApp,
  mockCreatePosition,
  mockUpdatePosition,
  mockGetOpenPositions,
  mockGetAllPositions,
  mockCreateCycle,
  mockUpdateCycle,
  mockGetActiveCycles,
  mockGetAllCycles,
  mockUpdateMonthlyIncome,
  mockGetMonthlyIncome,
  mockGetUserProfile,
  mockSaveUserProfile,
  mockMarkOnboardingSkipped,
  mockMarkOnboardingCompleted,
  mockUpdateActiveStrategies,
  mockMessagesCreate,
} = vi.hoisted(() => {
  let _app = null;
  return {
    captureApp: (app) => {
      app.listen = () => {};   // prevent real port binding; supertest uses http.createServer(app) directly
      _app = app;
    },
    getApp: () => _app,

    // wheelDb
    mockCreatePosition:      vi.fn().mockResolvedValue('wheel_pos_123'),
    mockUpdatePosition:      vi.fn().mockResolvedValue(undefined),
    mockGetOpenPositions:    vi.fn().mockResolvedValue([]),
    mockGetAllPositions:     vi.fn().mockResolvedValue([]),
    mockCreateCycle:         vi.fn().mockResolvedValue('cycle-001'),
    mockUpdateCycle:         vi.fn().mockResolvedValue(undefined),
    mockGetActiveCycles:     vi.fn().mockResolvedValue([]),
    mockGetAllCycles:        vi.fn().mockResolvedValue([]),
    mockUpdateMonthlyIncome: vi.fn().mockResolvedValue(undefined),
    mockGetMonthlyIncome:    vi.fn().mockResolvedValue([]),

    // userProfileDb
    mockGetUserProfile:           vi.fn().mockResolvedValue({ tradingMode: 'paper' }),
    mockSaveUserProfile:          vi.fn().mockResolvedValue({ success: true }),
    mockMarkOnboardingSkipped:    vi.fn().mockResolvedValue(undefined),
    mockMarkOnboardingCompleted:  vi.fn().mockResolvedValue(undefined),
    mockUpdateActiveStrategies:   vi.fn().mockResolvedValue(undefined),

    // anthropic
    mockMessagesCreate: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Mock analysis' }],
    }),
  };
});

// ── Mock express to capture the app before app.listen is called ───────────────

vi.mock('express', async () => {
  const expressModule = await vi.importActual('express');
  const realExpress = expressModule.default ?? expressModule;

  const factory = function expressFactory() {
    const app = realExpress();
    captureApp(app);
    return app;
  };

  factory.Router      = realExpress.Router;
  factory.json        = realExpress.json;
  factory.urlencoded  = realExpress.urlencoded;
  factory.static      = realExpress.static;
  factory.text        = realExpress.text;
  factory.raw         = realExpress.raw;

  return { default: factory };
});

// ── Auth middleware ───────────────────────────────────────────────────────────

vi.mock('../../middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { id: 'test-user-123', tenantId: 'test-tenant' };
    next();
  },
}));

// ── Route files (not under test; mock as pass-through) ───────────────────────

vi.mock('../../routes/search.js',      () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/sentiment.js',   () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/userProfile.js', () => ({ default: (_req, _res, next) => next() }));

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('../../services/wheelDb.js', () => ({
  createPosition:      mockCreatePosition,
  updatePosition:      mockUpdatePosition,
  getOpenPositions:    mockGetOpenPositions,
  getAllPositions:      mockGetAllPositions,
  createCycle:         mockCreateCycle,
  updateCycle:         mockUpdateCycle,
  getActiveCycles:     mockGetActiveCycles,
  getAllCycles:         mockGetAllCycles,
  updateMonthlyIncome: mockUpdateMonthlyIncome,
  getMonthlyIncome:    mockGetMonthlyIncome,
}));

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile:          mockGetUserProfile,
  saveUserProfile:         mockSaveUserProfile,
  markOnboardingSkipped:   mockMarkOnboardingSkipped,
  markOnboardingCompleted: mockMarkOnboardingCompleted,
  updateActiveStrategies:  mockUpdateActiveStrategies,
}));

vi.mock('../../services/sentimentScheduler.js', () => ({
  startSentimentScheduler: vi.fn(),
}));

vi.mock('../../services/entityMetadata.js', () => ({
  attachEntityScope:     vi.fn((x) => x),
  attachEntityScopeList: vi.fn((x) => x),
}));

vi.mock('../../services/brokerService.js', () => ({
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

vi.mock('../../services/marketDataService.js', () => ({
  getFundamentals:    vi.fn().mockResolvedValue(null),
  getHistorical:      vi.fn().mockResolvedValue(null),
  getMarketNews:      vi.fn().mockResolvedValue({ feed: [] }),
  getMarketQuote:     vi.fn().mockResolvedValue(null),
  getMarketSnapshot:  vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/cache.js', () => ({
  buildCacheKey: vi.fn().mockReturnValue('cache-key'),
  deleteCacheKey: vi.fn(),
}));

vi.mock('../../services/compressionService.js', () => ({
  compressFundamentals:      vi.fn().mockReturnValue(null),
  compressHistory:           vi.fn().mockReturnValue(null),
  compressPositions:         vi.fn().mockReturnValue([]),
  compressOrders:            vi.fn().mockReturnValue([]),
  compressSnapshot:          vi.fn().mockReturnValue([]),
  compressSentimentContext:  vi.fn().mockReturnValue(null),
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

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock() {
    this.messages = {
      create: mockMessagesCreate,
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

// ── Env vars (set before server.js is imported) ───────────────────────────────

process.env.ALPACA_LIVE_API_KEY    = 'test-live-key';
process.env.ALPACA_LIVE_SECRET_KEY = 'test-live-secret';

// ── Load server (triggers route registration; app is captured via express mock) ─

let app;

beforeAll(async () => {
  await import('../../server.js');
  app = getApp();
});

// ── Reset mock state before each test ────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenPositions.mockResolvedValue([]);
  mockGetActiveCycles.mockResolvedValue([]);
  mockGetMonthlyIncome.mockResolvedValue([]);
  mockGetUserProfile.mockResolvedValue({ tradingMode: 'paper' });
  mockCreatePosition.mockResolvedValue('wheel_pos_123');
  mockUpdatePosition.mockResolvedValue(undefined);
  mockUpdateMonthlyIncome.mockResolvedValue(undefined);
  mockSaveUserProfile.mockResolvedValue({ success: true });
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Mock analysis' }],
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Wheel Strategy API Routes', () => {

  // ── Group 1: GET /api/wheel/positions ──────────────────────────────────────

  describe('GET /api/wheel/positions', () => {
    it('returns 200 with { positions: [] } when no open positions', async () => {
      const res = await request(app).get('/api/wheel/positions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ positions: [] });
    });

    it('getOpenPositions was called with correct userId', async () => {
      await request(app).get('/api/wheel/positions');
      expect(mockGetOpenPositions).toHaveBeenCalledWith('test-user-123');
    });
  });

  // ── Group 2: POST /api/wheel/positions ─────────────────────────────────────

  describe('POST /api/wheel/positions', () => {
    const validBody = {
      ticker: 'AAPL',
      contractType: 'CSP',
      strike: 150,
      expiry: '2026-07-18',
      contracts: 1,
      premiumPerContract: 4.20,
    };

    it('returns 400 if ticker is missing', async () => {
      const { ticker: _t, ...withoutTicker } = validBody;
      const res = await request(app).post('/api/wheel/positions').send(withoutTicker);
      expect(res.status).toBe(400);
    });

    it("returns 400 if contractType is not 'CSP' or 'CC'", async () => {
      const res = await request(app)
        .post('/api/wheel/positions')
        .send({ ...validBody, contractType: 'PUT' });
      expect(res.status).toBe(400);
    });

    it('returns 200 with { success: true, position } on valid CSP input', async () => {
      const res = await request(app).post('/api/wheel/positions').send(validBody);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.position).toBe('wheel_pos_123');
    });

    it('totalPremium is calculated correctly: premiumPerContract * contracts * 100', async () => {
      await request(app).post('/api/wheel/positions').send(validBody);
      const positionData = mockCreatePosition.mock.calls[0][1];
      expect(positionData.totalPremium).toBe(420); // 4.20 * 1 * 100
    });

    it('updateMonthlyIncome is called with correct month and delta after successful creation', async () => {
      await request(app).post('/api/wheel/positions').send(validBody);
      expect(mockUpdateMonthlyIncome).toHaveBeenCalledOnce();
      const [calledUserId, calledMonth, calledDelta] = mockUpdateMonthlyIncome.mock.calls[0];
      expect(calledUserId).toBe('test-user-123');
      expect(calledMonth).toMatch(/^\d{4}-\d{2}$/);
      expect(calledDelta.premiumCollected).toBe(420);
      expect(calledDelta.cyclesOpen).toBe(1);
    });
  });

  // ── Group 3: PUT /api/wheel/positions/:positionId ──────────────────────────

  describe('PUT /api/wheel/positions/:positionId', () => {
    it('returns 200 on valid status update', async () => {
      const res = await request(app)
        .put('/api/wheel/positions/wheel_123')
        .send({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("when status is 'expired': realizedPL equals totalPremium, closedAt is set", async () => {
      await request(app)
        .put('/api/wheel/positions/wheel_123')
        .send({ status: 'expired', totalPremium: 420 });
      const updates = mockUpdatePosition.mock.calls[0][2];
      expect(updates.realizedPL).toBe(420);
      expect(updates.closedAt).toBeDefined();
    });

    it("when status is 'closed' and closePremium provided: realizedPL = totalPremium - closePremium", async () => {
      await request(app)
        .put('/api/wheel/positions/wheel_123')
        .send({ status: 'closed', totalPremium: 420, closePremium: 50 });
      const updates = mockUpdatePosition.mock.calls[0][2];
      expect(updates.realizedPL).toBe(370);
      expect(updates.closedAt).toBeDefined();
    });
  });

  // ── Group 4: GET /api/wheel/cycles ─────────────────────────────────────────

  describe('GET /api/wheel/cycles', () => {
    it('returns 200 with { cycles: [] }', async () => {
      const res = await request(app).get('/api/wheel/cycles');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ cycles: [] });
    });

    it('getActiveCycles called with correct userId', async () => {
      await request(app).get('/api/wheel/cycles');
      expect(mockGetActiveCycles).toHaveBeenCalledWith('test-user-123');
    });
  });

  // ── Group 5: GET /api/wheel/income ─────────────────────────────────────────

  describe('GET /api/wheel/income', () => {
    it('returns 200 with { income: [] }', async () => {
      const res = await request(app).get('/api/wheel/income');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ income: [] });
    });

    it('default months param is 12', async () => {
      await request(app).get('/api/wheel/income');
      expect(mockGetMonthlyIncome).toHaveBeenCalledWith('test-user-123', 12);
    });

    it('custom months param is passed through correctly', async () => {
      await request(app).get('/api/wheel/income?months=6');
      expect(mockGetMonthlyIncome).toHaveBeenCalledWith('test-user-123', 6);
    });
  });

  // ── Group 6: POST /api/wheel/analyze/:ticker ───────────────────────────────

  describe('POST /api/wheel/analyze/:ticker', () => {
    it('returns 200 with { ticker: "AAPL", analysis: "Mock analysis" }', async () => {
      const res = await request(app).post('/api/wheel/analyze/AAPL');
      expect(res.status).toBe(200);
      expect(res.body.ticker).toBe('AAPL');
      expect(res.body.analysis).toBe('Mock analysis');
    });

    it('anthropic.messages.create was called once', async () => {
      await request(app).post('/api/wheel/analyze/AAPL');
      expect(mockMessagesCreate).toHaveBeenCalledOnce();
    });

    it("model used is 'claude-sonnet-4-20250514'", async () => {
      await request(app).post('/api/wheel/analyze/AAPL');
      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    });
  });

  // ── Group 7: GET /api/settings/trading-mode ────────────────────────────────

  describe('GET /api/settings/trading-mode', () => {
    it("returns 200 with { mode: 'paper' } by default", async () => {
      const res = await request(app).get('/api/settings/trading-mode');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('paper');
    });

    it("returns { mode: 'live' } when profile.tradingMode is 'live'", async () => {
      mockGetUserProfile.mockResolvedValueOnce({ tradingMode: 'live' });
      const res = await request(app).get('/api/settings/trading-mode');
      expect(res.body.mode).toBe('live');
    });
  });

  // ── Group 8: PUT /api/settings/trading-mode ────────────────────────────────

  describe('PUT /api/settings/trading-mode', () => {
    it("returns 400 if mode is not 'paper' or 'live'", async () => {
      const res = await request(app)
        .put('/api/settings/trading-mode')
        .send({ mode: 'invalid' });
      expect(res.status).toBe(400);
    });

    it("returns 400 with error message if switching to 'live' and ALPACA_LIVE_API_KEY is missing", async () => {
      const origKey    = process.env.ALPACA_LIVE_API_KEY;
      const origSecret = process.env.ALPACA_LIVE_SECRET_KEY;
      try {
        delete process.env.ALPACA_LIVE_API_KEY;
        delete process.env.ALPACA_LIVE_SECRET_KEY;
        const res = await request(app)
          .put('/api/settings/trading-mode')
          .send({ mode: 'live' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Live account API keys not configured');
      } finally {
        process.env.ALPACA_LIVE_API_KEY    = origKey;
        process.env.ALPACA_LIVE_SECRET_KEY = origSecret;
      }
    });

    it("returns 200 with { success: true, mode: 'live' } when live keys are present", async () => {
      const res = await request(app)
        .put('/api/settings/trading-mode')
        .send({ mode: 'live' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mode).toBe('live');
    });

    it("returns 200 switching to 'paper' always works", async () => {
      const res = await request(app)
        .put('/api/settings/trading-mode')
        .send({ mode: 'paper' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mode).toBe('paper');
    });

    it('saveUserProfile was called with correct tradingMode', async () => {
      await request(app)
        .put('/api/settings/trading-mode')
        .send({ mode: 'paper' });
      const [calledUserId, calledTenantId, calledData] = mockSaveUserProfile.mock.calls[0];
      expect(calledUserId).toBe('test-user-123');
      expect(calledTenantId).toBe('test-tenant');
      expect(calledData.tradingMode).toBe('paper');
    });
  });
});
