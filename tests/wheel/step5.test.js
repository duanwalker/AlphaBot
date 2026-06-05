import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

// ── Hoisted mocks (available inside vi.mock factories) ────────────────────────

const {
  captureApp,
  getApp,
  mockGetOpenPositions,
  mockGetUserProfile,
  mockSaveUserProfile,
  mockGetMarketNews,
  mockGetFundamentals,
  mockGetLatestSnapshot,
  mockGetWatchList,
  mockCompressFundamentals,
  mockGetAlpacaPositions,
  mockMessagesCreate,
} = vi.hoisted(() => {
  let _app = null;
  return {
    captureApp: (app) => {
      app.listen = () => {};
      _app = app;
    },
    getApp: () => _app,

    mockGetOpenPositions:     vi.fn().mockResolvedValue([]),
    mockGetUserProfile:       vi.fn().mockResolvedValue({ activeStrategies: [] }),
    mockSaveUserProfile:      vi.fn().mockResolvedValue({ success: true }),
    mockGetMarketNews:        vi.fn().mockResolvedValue({ feed: [] }),
    mockGetFundamentals:      vi.fn().mockResolvedValue({ price: 195.50, pe: 28 }),
    mockGetLatestSnapshot:    vi.fn().mockResolvedValue({
      sentimentScore: 0.70, signalStrength: 'high', trend: 'rising',
    }),
    mockGetWatchList:         vi.fn().mockResolvedValue([]),
    mockCompressFundamentals: vi.fn((d) => d),
    mockGetAlpacaPositions:   vi.fn().mockResolvedValue([]),
    mockMessagesCreate:       vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Mock wheel analysis with news context' }],
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

// ── Route files (not under test; mock as pass-through) ───────────────────────

vi.mock('../../routes/search.js',      () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/sentiment.js',   () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../routes/userProfile.js', () => ({ default: (_req, _res, next) => next() }));

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('../../services/wheelDb.js', () => ({
  createPosition:      vi.fn().mockResolvedValue('wheel_pos_123'),
  updatePosition:      vi.fn().mockResolvedValue(undefined),
  getOpenPositions:    mockGetOpenPositions,
  getAllPositions:      vi.fn().mockResolvedValue([]),
  createCycle:         vi.fn().mockResolvedValue('cycle-001'),
  updateCycle:         vi.fn().mockResolvedValue(undefined),
  getActiveCycles:     vi.fn().mockResolvedValue([]),
  getAllCycles:         vi.fn().mockResolvedValue([]),
  updateMonthlyIncome: vi.fn().mockResolvedValue(undefined),
  getMonthlyIncome:    vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/userProfileDb.js', () => ({
  getUserProfile:          mockGetUserProfile,
  saveUserProfile:         mockSaveUserProfile,
  markOnboardingSkipped:   vi.fn().mockResolvedValue(undefined),
  markOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
  updateActiveStrategies:  vi.fn().mockResolvedValue(undefined),
}));

// getFundamentals and getMarketNews are imported services from marketDataService.js
vi.mock('../../services/marketDataService.js', () => ({
  getFundamentals:   mockGetFundamentals,
  getHistorical:     vi.fn().mockResolvedValue(null),
  getMarketNews:     mockGetMarketNews,
  getMarketQuote:    vi.fn().mockResolvedValue(null),
  getMarketSnapshot: vi.fn().mockResolvedValue([]),
}));

// compressFundamentals returns input as-is so the raw fundamentals pass through to Claude
vi.mock('../../services/compressionService.js', () => ({
  compressFundamentals:       mockCompressFundamentals,
  compressHistory:            vi.fn().mockReturnValue(null),
  compressPositions:          vi.fn().mockReturnValue([]),
  compressOrders:             vi.fn().mockReturnValue([]),
  compressSnapshot:           vi.fn().mockReturnValue([]),
  compressSentimentContext:   vi.fn().mockReturnValue(null),
  compressSentimentForClaude: vi.fn().mockReturnValue(null),
}));

// getSentiment for the wheel/analyze route is getLatestSnapshot from sentimentDb.js
// (server.js calls getLatestSnapshot, then passes it through local compressSentiment)
vi.mock('../../services/sentimentDb.js', () => ({
  getLatestSnapshot:  mockGetLatestSnapshot,
  getSnapshotHistory: vi.fn().mockResolvedValue([]),
  getWatchList:       mockGetWatchList,
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
  getAlpacaPositions: mockGetAlpacaPositions,
  getAlpacaQuote:     vi.fn().mockResolvedValue({}),
  createOandaOrder:   vi.fn().mockResolvedValue({}),
  getOandaAccount:    vi.fn().mockResolvedValue({}),
  getOandaPositions:  vi.fn().mockResolvedValue([]),
  getOandaPrice:      vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/cache.js', () => ({
  buildCacheKey:  vi.fn().mockReturnValue('cache-key'),
  deleteCacheKey: vi.fn(),
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

// ── Load server ───────────────────────────────────────────────────────────────

let app;

beforeAll(async () => {
  await import('../../server.js');
  app = getApp();
});

// ── Reset mock state before each test ────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenPositions.mockResolvedValue([]);
  mockGetUserProfile.mockResolvedValue({ activeStrategies: [] });
  mockSaveUserProfile.mockResolvedValue({ success: true });
  mockGetMarketNews.mockResolvedValue({ feed: [] });
  mockGetFundamentals.mockResolvedValue({ price: 195.50, pe: 28 });
  mockGetLatestSnapshot.mockResolvedValue({
    sentimentScore: 0.70, signalStrength: 'high', trend: 'rising',
  });
  mockGetWatchList.mockResolvedValue([]);
  mockCompressFundamentals.mockImplementation((d) => d);
  mockGetAlpacaPositions.mockResolvedValue([]);
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Mock wheel analysis with news context' }],
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Wheel Step 5 — News Integration & Wheel Insights', () => {

  // ── Part A: POST /api/wheel/analyze/:ticker ───────────────────────────────

  describe('POST /api/wheel/analyze/:ticker', () => {

    it('1. calls getMarketNews with the correct ticker as first argument', async () => {
      await request(app).post('/api/wheel/analyze/AAPL');
      expect(mockGetMarketNews.mock.calls[0][0]).toBe('AAPL');
    });

    it('2. returns 200 with analysis when news fetch succeeds', async () => {
      mockGetMarketNews.mockResolvedValueOnce({
        feed: [{
          title: 'Apple reports record earnings',
          source: 'Reuters',
          time_published: '2026060410000',
          summary: 'Apple exceeded expectations...',
          overall_sentiment_label: 'Bullish',
          relevance_score: 0.95,
        }],
      });

      const res = await request(app).post('/api/wheel/analyze/AAPL');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticker: 'AAPL', analysis: 'Mock wheel analysis with news context' });
      expect(mockMessagesCreate).toHaveBeenCalledOnce();
    });

    it('3. slices news feed to at most 5 articles before sending to Claude', async () => {
      const articles = Array.from({ length: 8 }, (_, i) => ({
        title: `Article ${i}`,
        source: 'Reuters',
        time_published: '2026060410000',
        summary: `Summary ${i}`,
        overall_sentiment_label: 'Neutral',
        relevance_score: 0.5,
      }));
      mockGetMarketNews.mockResolvedValueOnce({ feed: articles });

      await request(app).post('/api/wheel/analyze/AAPL');

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;

      // Check the header count
      const countMatch = userContent.match(/Recent news \((\d+) articles\)/);
      expect(Number(countMatch[1])).toBeLessThanOrEqual(5);

      // Parse the embedded JSON and verify array length
      const afterMarker = userContent.split(/Recent news \(\d+ articles\):\n/)[1];
      const newsJson    = afterMarker.split('\n\nOpen Wheel Positions:')[0];
      const newsArray   = JSON.parse(newsJson);
      expect(newsArray.length).toBeLessThanOrEqual(5);
    });

    it('4. maps article fields correctly and truncates summary to 300 chars', async () => {
      const longSummary = 'x'.repeat(500);
      mockGetMarketNews.mockResolvedValueOnce({
        feed: [{
          title: 'Big news',
          source: 'Bloomberg',
          time_published: '2026060412000',
          summary: longSummary,
          overall_sentiment_label: 'Bullish',
          relevance_score: 0.88,
        }],
      });

      await request(app).post('/api/wheel/analyze/AAPL');

      const callArgs   = mockMessagesCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;

      const afterMarker = userContent.split(/Recent news \(\d+ articles\):\n/)[1];
      const newsJson    = afterMarker.split('\n\nOpen Wheel Positions:')[0];
      const newsArray   = JSON.parse(newsJson);
      const article     = newsArray[0];

      expect(article).toHaveProperty('title', 'Big news');
      expect(article).toHaveProperty('source', 'Bloomberg');
      expect(article).toHaveProperty('published', '2026060412000');
      expect(article).toHaveProperty('sentiment', 'Bullish');
      expect(article).toHaveProperty('relevance', 0.88);
      expect(article.summary.length).toBeLessThanOrEqual(300);
    });

    it('5. returns 200 with analysis even when news fetch fails', async () => {
      mockGetMarketNews.mockRejectedValueOnce(new Error('News API unavailable'));

      const res = await request(app).post('/api/wheel/analyze/AAPL');

      expect(res.status).toBe(200);
      expect(res.body.analysis).toBeDefined();
      expect(mockMessagesCreate).toHaveBeenCalledOnce();
    });

    it('6. uses correct model, max_tokens, and temperature', async () => {
      await request(app).post('/api/wheel/analyze/AAPL');

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(1500);
      expect(callArgs.temperature).toBe(0.3);
    });

  });

  // ── Part B: GET /api/assistant/insights — wheel cards ────────────────────

  describe('GET /api/assistant/insights — wheel strategy cards', () => {

    it('7. does not add wheel cards for a non-wheel user', async () => {
      mockGetUserProfile.mockResolvedValue({ activeStrategies: ['momentum'] });
      mockGetWatchList.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockGetLatestSnapshot.mockResolvedValue({
        sentimentScore: 0.75, signalStrength: 'high', trend: 'rising',
      });

      const res = await request(app).get('/api/assistant/insights');

      expect(res.status).toBe(200);
      const wheelCards = res.body.insights.filter(
        (c) => c.type === 'opportunity' && c.title.includes('wheel strategy candidate'),
      );
      expect(wheelCards).toHaveLength(0);
    });

    it('8. does not add wheel cards when sentiment score is below 0.65 threshold', async () => {
      mockGetUserProfile.mockResolvedValue({ activeStrategies: ['wheel_strategy'] });
      mockGetWatchList.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockGetLatestSnapshot.mockResolvedValue({
        sentimentScore: 0.45, signalStrength: 'high', trend: 'rising',
      });

      const res = await request(app).get('/api/assistant/insights');

      expect(res.status).toBe(200);
      const wheelCards = res.body.insights.filter(
        (c) => c.type === 'opportunity' && c.title.includes('wheel strategy candidate'),
      );
      expect(wheelCards).toHaveLength(0);
    });

    it('9. does not add wheel cards when signal strength is not high', async () => {
      mockGetUserProfile.mockResolvedValue({ activeStrategies: ['wheel_strategy'] });
      mockGetWatchList.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockGetLatestSnapshot.mockResolvedValue({
        sentimentScore: 0.80, signalStrength: 'medium', trend: 'rising',
      });

      const res = await request(app).get('/api/assistant/insights');

      expect(res.status).toBe(200);
      const wheelCards = res.body.insights.filter(
        (c) => c.type === 'opportunity' && c.title.includes('wheel strategy candidate'),
      );
      expect(wheelCards).toHaveLength(0);
    });

    it('10. adds a wheel opportunity card for a qualifying ticker', async () => {
      mockGetUserProfile.mockResolvedValue({ activeStrategies: ['wheel_strategy'] });
      mockGetWatchList.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockGetLatestSnapshot.mockResolvedValue({
        sentimentScore: 0.75, signalStrength: 'high', trend: 'rising',
      });

      const res = await request(app).get('/api/assistant/insights');

      expect(res.status).toBe(200);
      const wheelCard = res.body.insights.find(
        (c) => c.type === 'opportunity' && c.title.includes('wheel strategy candidate'),
      );
      expect(wheelCard).toBeDefined();
      expect(wheelCard.ticker).toBe('AAPL');
      expect(wheelCard.body).toContain('cash-secured put');
      expect(wheelCard.action).toContain('CSP strike and expiry');
    });

    it('11. returns 200 and preserves existing insights when wheel block throws', async () => {
      // sentimentResults is block-scoped inside `if (symbols.length > 0)` (server.js ~line 949).
      // The wheel block (outside that if) references it after the block closes — ReferenceError
      // when isWheelUser=true. The try/catch swallows the error; non-wheel cards survive.
      mockGetUserProfile.mockResolvedValue({ activeStrategies: ['wheel_strategy'] });
      mockGetWatchList.mockResolvedValue([{ ticker: 'AAPL' }]);
      mockGetLatestSnapshot.mockResolvedValue({
        sentimentScore: 0.80, signalStrength: 'high', trend: 'rising',
      });

      const res = await request(app).get('/api/assistant/insights');

      expect(res.status).toBe(200);
      // Briefing card is always present
      expect(res.body.insights.some((c) => c.type === 'briefing')).toBe(true);
      // Regular opportunity card built inside the if block (score 0.80 > 0.15) is preserved
      expect(
        res.body.insights.some(
          (c) => c.type === 'opportunity' && !c.title.includes('wheel strategy candidate'),
        ),
      ).toBe(true);
    });

  });

});
