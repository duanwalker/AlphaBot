# AlphaBot — UI Redesign & Simplified Assistant Brief
*Prepared by Claude (Anthropic) as lead architect*
*Date: May 2026*
*Scope: Full UI redesign to tabbed layout + simplified assistant context system*

---

## Codebase Context (reviewed from github.com/duanwalker/AlphaBot)

### Current frontend structure
- `client/src/App.js` — React Router with top nav links: Dashboard, Research, Orders,
  Positions, AI Assistant (modal), Settings
- `client/src/pages/Dashboard.jsx` — grid layout with AccountCard, MarketSnapshot,
  HistoricalSparklineCard, QuickActions, SentimentDashboardCard, PositionsCard, OrdersCard
- `client/src/pages/Research.jsx` — reads `?symbol=` from URL, renders
  ResearchSentimentPanel + RelevantArticlesPanel
- `client/src/components/AssistantPanel.jsx` — modal/drawer, already streams responses,
  already passes `{ account, positions, orders, marketSnapshot, symbol }` as context
- Sentiment components already built: SentimentGauge, SentimentDashboardCard,
  ResearchSentimentPanel, ResearchSentimentChart, SentimentRow, SentimentBadge,
  SentimentArrow
- Hooks already built: useAlpaca, useLatestSentiment, useSentimentHistory,
  useSymbolSearch, useHistoricalData

### Current backend structure
- `server.js` — Express with auth middleware, sentiment routes, scheduler startup
- `services/reasoningAgent.js` — Claude Haiku (`claude-haiku-4-5-20251001`) used for
  post normalization — already implemented and working
- `services/sentimentService.js` — full pipeline: StockTwits + Reddit → FinBERT →
  `selectTop30()` → Claude sentiment agent — already implemented
- `services/sentimentDb.js` — Azure Table Storage for watchlist + snapshots —
  already implemented with retry logic and connection string handling
- `routes/sentiment.js` — watchlist CRUD + history + latest endpoints — already
  implemented including `isValidSymbol()` validation
- `brokers/AlpacaAdapter.js`, `brokers/OandaAdapter.js`, `brokers/brokerFactory.js` —
  broker abstraction layer already implemented
- `services/brokerService.js` — broker facade already implemented
- `services/compressionService.js` — compression helpers already implemented
- `services/cache.js` — in-memory cache with TTLs already implemented
- Scheduler already wired into server.js startup

### What does NOT exist yet
- Options tab / options trading functionality
- Portfolio tab (Orders and Positions are separate pages, not a unified tab)
- Tabbed navigation layout (currently top nav with React Router)
- Assistant tab with proactive insight cards
- Portfolio value time chart as hero element
- Six-tab unified layout

---

## Part 1: New Tab Architecture

### Replace the current top nav + React Router page structure with a six-tab layout.

The current `App.js` uses `<BrowserRouter>` with `<Link>` navigation and separate page
routes. Replace this with a tab-based layout where all content renders within one shell
component. React Router can be kept for deep-linking (e.g. `/research?symbol=NVDA`) but
the primary navigation becomes tabs.

### Six tabs (in order):

```
Overview | Assistant | Research | Sentiment | Options | Portfolio
```

### Tab responsibilities:

| Tab | Primary content | Notes |
|---|---|---|
| Overview | Portfolio chart hero + positions + market + AlphaBot sidebar | Landing page |
| Assistant | Full-width proactive insights feed + conversation | AI-first experience |
| Research | Symbol search + fundamentals + chart + news + sentiment + trade widget | Deep-dive |
| Sentiment | Sentiment watch list + price vs sentiment overlay chart | Analysis |
| Options | Options chain + order ticket + Greeks + open options positions | New |
| Portfolio | Stats + stocks + options positions + orders + P&L + allocation | Renamed from Orders/Positions |

### Navigation changes to `App.js`:

```jsx
// Replace current <nav> link structure with tab state
const TABS = ['overview', 'assistant', 'research', 'sentiment', 'options', 'portfolio'];
const [activeTab, setActiveTab] = useState('overview');

// Tab bar replaces current nav links
// Keep React Router only for /settings and direct URL linking
```

### Keep from current App.js:
- `useAlpaca` hook — still the source for account, positions, orders
- `showAssistant`, `marketSnapshot`, `activeSymbol` state
- Settings routes — keep as-is under `/settings`

---

## Part 2: Overview Tab

Replace current `Dashboard.jsx` layout with the new Overview design.

### Layout: two-column grid (left: main content, right: AlphaBot sidebar ~280px)

**Left column (top to bottom):**

1. Portfolio value chart card (hero — clickable, navigates to Portfolio tab)
   - Large portfolio value + day P&L headline
   - SVG or Recharts line chart (Recharts already installed)
   - Time buttons: 1M / 3M / 6M / 1Y
   - Data source: new `usePortfolioHistory` hook (see Part 6)
   - Clicking the card navigates to Portfolio tab

2. Two-column sub-grid:
   - Left: Positions card (scrollable, max-height ~200px) — reuse `PositionsCard`
     component, make it scrollable
   - Right: stacked cards:
     - Market snapshot (reuse `MarketSnapshot` component)
     - Today's P&L breakdown (realized + unrealized + net)

**Right column (AlphaBot sidebar):**
- Header: "AlphaBot" + "Full view ↗" button (navigates to Assistant tab)
- Morning briefing card (from `/api/assistant` morning briefing endpoint — see Part 5)
- Up to 2 proactive insight cards (opportunity / risk alerts from sentiment data)
- Input bar at bottom: sends to `/api/assistant` with current context

### Reuse existing components:
- `PositionsCard` — add `scrollable` prop, cap height via CSS
- `MarketSnapshot` — use as-is
- `SentimentDashboardCard` — move to Overview sidebar or remove from main grid
  (sentiment now lives in its own tab)
- `AccountCard` — repurpose fields for the portfolio stat display

---

## Part 3: Assistant Tab

Full-width two-column layout. No dashboard cards. AI-first experience.

### Left column: Proactive insights feed

```jsx
// Insight card types:
// - opportunity (green left border) — triggered by sentiment spike above rolling avg
// - risk (red left border) — triggered by declining sentiment on held position
// - briefing (blue left border) — market-wide morning/afternoon summary
```

Each insight card contains:
- Type label + timestamp
- 2-3 sentence description
- One or two action buttons that call `sendPrompt()` with pre-built queries

**Data source for insight cards:** new `/api/assistant/insights` endpoint (see Part 5)
that generates 2-3 proactive cards based on current watchlist sentiment + positions.

### Right column: Conversation

Reuse and expand `AssistantPanel.jsx`. Currently it's a modal/drawer — refactor it to
render inline as a full-height panel when on the Assistant tab, or as a modal/drawer on
other tabs (preserve existing behavior for the "AI Assistant" nav link).

```jsx
// AssistantPanel already:
// - streams responses ✅
// - passes account, positions, orders, marketSnapshot, symbol as context ✅
// - has message history state ✅

// Add to AssistantPanel:
// - mode indicator badge ("Market mode" / "Symbol mode: NVDA")
// - suggested prompt buttons below each assistant response
// - inline rendering mode (prop: inline={true} for Assistant tab)
```

---

## Part 4: Research Tab

Expand current `Research.jsx` significantly. Currently only shows
`ResearchSentimentPanel` and `RelevantArticlesPanel`.

### New Research tab layout (two-column):

**Left column:**
- Symbol search bar (reuse `useSymbolSearch` hook — already built)
- Symbol header: name, exchange, current price, sentiment badge
  (reuse `SentimentBadge` component — already built)
- Price chart (reuse `HistoricalSparklineCard` or expand with timeframe buttons)
- Fundamentals grid (P/E, EPS, 52w high/low, Beta, Market Cap, Profit Margin)
  — data from existing `/api/fundamentals/:symbol` endpoint
- Recent news (reuse `RelevantArticlesPanel` — already built)

**Right column:**
- Sentiment panel (reuse `ResearchSentimentPanel` — already built)
- Trade widget — Buy/Sell stock order form (symbol pre-filled from Research context)
- Options ideas button → navigates to Options tab with symbol pre-loaded

### Trade widget in Research tab:

```jsx
// Symbol is always known from Research page context — pre-fill it
// Do NOT let user type a symbol here — it's inherited from what they're researching

function ResearchTradeWidget({ symbol }) {
  const [side, setSide] = useState('buy');     // 'buy' | 'sell'
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState('market');

  async function handlePlaceOrder() {
    // Call POST /api/alpaca/orders with { symbol, qty, side, type: orderType }
    // Show confirmation toast (ToastProvider already exists)
  }

  // ...
}
```

---

## Part 5: Simplified Assistant Context System

### The problem the old three-mode system was solving

The previous architecture proposed a complex three-mode system (single-symbol / market /
multi-symbol) with NLP inference, ticker validation, company name maps, and conversation
session state. This was designed to solve ambiguity in natural language input like
"how is tech doing" vs "thoughts on NVDA."

### Why the new UI makes this mostly unnecessary

With the tabbed UI, context is now UI-provided in the vast majority of cases:
- Research tab always knows the active symbol
- Options tab always knows the active symbol
- Sentiment tab knows the selected watchlist symbol
- Overview and Assistant tab have no specific symbol → market mode

The UI resolves what NLP inference was trying to guess.

### Simplified two-state context resolver

Replace the complex three-mode architecture with this simple resolver.
Add to `server.js` or a new `services/contextResolver.js`:

```javascript
// services/contextResolver.js

const COMMON_WORDS = new Set([
  'doing', 'going', 'market', 'today', 'tomorrow', 'week', 'think',
  'buy', 'sell', 'good', 'bad', 'high', 'low', 'news', 'tech',
  'sector', 'trade', 'stock', 'call', 'put', 'best', 'top', 'more',
  'less', 'some', 'with', 'from', 'what', 'when', 'will', 'would',
]);

function extractTickerFromMessage(message) {
  const tokens = message.toUpperCase().split(/\s+|[^A-Z]/g).filter(Boolean);
  for (const token of tokens) {
    if (
      token.length >= 2 &&
      token.length <= 5 &&
      /^[A-Z]+$/.test(token) &&
      !COMMON_WORDS.has(token.toLowerCase())
    ) {
      return token;
    }
  }
  return null;
}

export function resolveContext(uiSymbol, message) {
  // UI-provided symbol always wins — Research/Options/Sentiment tabs set this
  if (uiSymbol) {
    return { mode: 'single', symbol: uiSymbol.toUpperCase() };
  }

  // Fallback: did they mention a ticker in the chat message?
  const mentioned = extractTickerFromMessage(message || '');
  if (mentioned) {
    return { mode: 'single', symbol: mentioned };
  }

  // No symbol anywhere — market mode
  return { mode: 'market', symbol: null };
}
```

### Updated `/api/assistant` handler

The existing `/api/assistant` endpoint in `server.js` already receives `context.symbol`
from the frontend. Wire in the context resolver:

```javascript
// In /api/assistant handler — add near the top after destructuring req.body

import { resolveContext } from './services/contextResolver.js';

// Inside handler:
const { message, context = {} } = req.body;
const { id: userId, tenantId } = req.user;

// Resolve context — UI symbol wins, message inference is fallback
const resolved = resolveContext(context.symbol, message);

// Log for debugging
console.log('[CONTEXT]', resolved.mode, '|', resolved.symbol || 'no symbol');
```

### Two system prompts (replace current single prompt)

```javascript
// services/systemPrompts.js — new file

export function getSingleSymbolPrompt(symbol) {
  return `You are AlphaBot, an AI trading assistant embedded in a personal trading dashboard.
You are analyzing ${symbol}.

You will receive compressed data: fundamentals, price history summary, sentiment analysis,
and recent news headlines. Use ONLY what is provided. Do not fabricate missing fields.

Sentiment signal:
- sentimentScore > 0.65 = broadly bullish social sentiment
- sentimentScore < 0.35 = broadly bearish social sentiment
- High signalStrength + rising trend = more reliable signal
- Low agentConfidence = treat with skepticism
- Never use sentiment as the sole basis for a recommendation

Output format:
A) Snapshot — current state in 2-3 sentences
B) Primary idea — best opportunity with rationale
C) Risk factors — what could go wrong
D) Questions — only if critical data is missing`;
}

export function getMarketPrompt() {
  return `You are AlphaBot, an AI trading assistant embedded in a personal trading dashboard.

No specific symbol is in focus. Provide a market-wide assessment based on the
index snapshots, sector data, and watchlist sentiment provided.

Tasks:
1) Assess overall market tone (risk-on vs risk-off)
2) Identify which sectors are showing strength or weakness
3) Relate conditions to the user's watchlist sentiment
4) Suggest any positioning adjustments worth considering

Be concise — market overviews should be scannable, not exhaustive.

Output format:
A) Market tone — 1-2 sentences
B) Sector breakdown — what's strong / weak
C) Watchlist relevance — how market conditions affect tracked symbols
D) Positioning thoughts — any adjustments worth considering`;
}
```

### New `/api/assistant/insights` endpoint

This powers the proactive insight cards on the Overview and Assistant tabs.
Add to `server.js`:

```javascript
// GET /api/assistant/insights
// Returns 2-3 proactive insight cards based on watchlist sentiment + positions
app.get('/api/assistant/insights', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;

    // Fetch watchlist + latest sentiment for each symbol
    const watchlist = await getWatchList(userId);
    const sentimentResults = await Promise.allSettled(
      watchlist.slice(0, 10).map(ticker => getLatestSnapshot(ticker))
    );

    // Fetch positions to cross-reference sentiment with held stocks
    let positions = [];
    try {
      positions = await getAlpacaPositions(userId, tenantId);
    } catch (e) { /* positions optional */ }

    const insights = [];

    sentimentResults.forEach((result, i) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const snap = result.value;
      const ticker = watchlist[i];

      // Opportunity: sentiment spike (high score + high signal)
      if (snap.sentimentScore >= 0.70 && snap.signalStrength === 'high' && snap.trend === 'rising') {
        insights.push({
          type: 'opportunity',
          ticker,
          title: `${ticker} — strong bullish signal`,
          body: `Sentiment score ${snap.sentimentScore.toFixed(2)} with ${snap.signalStrength} signal strength and rising trend. ${snap.reasoning || ''}`,
          action: `Analyze ${ticker} for a potential entry`,
          timestamp: snap.timestamp,
        });
      }

      // Risk: declining sentiment on a held position
      const held = positions.find(p => p.symbol === ticker);
      if (held && snap.sentimentScore <= 0.35 && snap.trend === 'falling') {
        insights.push({
          type: 'risk',
          ticker,
          title: `${ticker} — bearish sentiment on held position`,
          body: `Sentiment falling to ${snap.sentimentScore.toFixed(2)}. Your position is currently ${held.unrealizedPLPercent > 0 ? '+' : ''}${parseFloat(held.unrealizedPLPercent).toFixed(1)}%.`,
          action: `Should I cut or hold my ${ticker} position given the declining sentiment?`,
          timestamp: snap.timestamp,
        });
      }
    });

    // Limit to 3 most relevant insights
    res.json({ insights: insights.slice(0, 3) });

  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});
```

---

## Part 6: Options Tab (New Feature)

### Backend: new options endpoints

Alpaca supports options data. Add to `server.js`:

```javascript
// GET /api/options/chain/:symbol?expiration=2026-05-16
app.get('/api/options/chain/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const expiration = req.query.expiration;
    const { id: userId } = req.user;

    // Alpaca options chain endpoint
    const url = expiration
      ? `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}?expiration_date=${expiration}&limit=100`
      : `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}?limit=100`;

    const r = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      }
    });

    if (!r.ok) throw new Error(`Alpaca options ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/options/expirations/:symbol
app.get('/api/options/expirations/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const r = await fetch(
      `https://data.alpaca.markets/v1beta1/options/contracts?underlying_symbols=${symbol}&limit=50`,
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
        }
      }
    );
    if (!r.ok) throw new Error(`Alpaca options ${r.status}`);
    const data = await r.json();

    // Extract unique expiration dates
    const expirations = [...new Set(
      (data.option_contracts || []).map(c => c.expiration_date)
    )].sort();

    res.json({ expirations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/options/orders — place options order via Alpaca
app.post('/api/options/orders', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const order = req.body;
    // Alpaca options orders use the same /v2/orders endpoint
    // with type: 'limit' and option_contract_symbol
    const data = await createAlpacaOrder(order, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### Frontend: Options tab component

Create `client/src/pages/Options.jsx`:

```jsx
// client/src/pages/Options.jsx
// Displays options chain with calls/puts toggle, expiration selector,
// scrollable chain table with full Greeks, and order ticket

// Key state:
// - symbol (string) — pre-loaded if navigated from Research tab
// - chainView ('calls' | 'both' | 'puts')
// - selectedExpiration (string date)
// - selectedContract (object from chain row click)
// - orderSide ('buy' | 'sell')
// - orderQty (number)

// Chain table columns (scrollable horizontally):
// Calls view: Bid, Ask, Last, Chg, Chg%, Vol, OI, Δ Delta, Γ Gamma, Θ Theta, V Vega, ρ Rho | Strike
// Puts view:  Strike | Bid, Ask, Last, Chg, Chg%, Vol, OI, Δ Delta, Γ Gamma, Θ Theta, V Vega, ρ Rho
// Both view:  C Bid, C Ask, C Δ, C Chg%, C OI | Strike | P Bid, P Ask, P Δ, P Chg%, P OI

// Order ticket (right panel):
// - Buy to open / Sell to open toggle (color-coded green/red)
// - Selected contract display with Call/Put badge
// - Contracts input + order type select
// - Est. cost + break even calculation
// - Greeks panel: Delta, Gamma, Theta ($/day), Vega ($/1% IV), Rho, DTE
// - "Review & place order ↗" button → sends to AlphaBot for review first
//   then calls POST /api/options/orders on confirmation

// AlphaBot integration cards (bottom of right panel):
// - "Strategy ideas ↗" → sendPrompt with symbol + IV + sentiment + earnings context
// - "IV crush risk ↗" → sendPrompt explaining IV risk for this specific contract
// - "Spread vs long call ↗" → sendPrompt comparing strategies
```

---

## Part 7: Portfolio Tab

Rename and expand. Currently Orders and Positions are separate pages — consolidate
into one Portfolio tab.

### Layout (top to bottom):

**Row 1 — five stat cards:**
Total value · Day P&L · Buying power · Stock positions count · Options positions count

**Row 2 — two-column grid:**
- Stocks table (scrollable): Symbol, Details, Value, P&L, Return %
  — data from existing `getAlpacaPositions()`
- Options positions table (scrollable): Contract name with Call/Put badge, Value, P&L, Return
  — data from new `/api/options/positions` endpoint or filtered from positions

**Row 3 — three-column grid:**
- Order history (scrollable, filter: All / Filled / Pending)
  — data from existing `getAlpacaOrders()`
- Today's P&L breakdown (realized + unrealized + net)
- Portfolio allocation bars (symbol → % of portfolio, colored bars)

### Navigation from Overview:
- Clicking the portfolio value chart card navigates to Portfolio tab
- On mobile: tapping the portfolio value card navigates to Portfolio tab

---

## Part 8: Sentiment Tab

Keep existing sentiment components, reorganize into the tab layout.

### Layout: two-column (left: watch list, right: price vs sentiment chart)

**Left column — Sentiment watch list:**
- Reuse `SentimentDashboardCard` or `SentimentRow` components
- Each row: ticker, mini bar gauge, score, trend arrow
- Active/selected row has green left border
- Clicking a row updates the chart on the right
- "Updated X:XX · next Y:XX" footer
- "+ Add" button

**Right column — Price vs Sentiment chart:**
- Reuse `ResearchSentimentChart` — already built
- Active ticker from watch list selection drives chart data
- Time buttons: 30D / 60D / 90D
- Recharts ComposedChart: price line (solid, indigo) + sentiment line (dashed, amber)
  + volume bars (green, semi-transparent)
- Legend + "Leads price by avg N days on [ticker]" stat
- Annotation marker where notable sentiment spikes occurred

---

## Implementation Order for Copilot

Build in this sequence. Each step is independently testable.

```
Step 1: services/contextResolver.js
        services/systemPrompts.js
        Test: resolveContext('NVDA', 'anything') → { mode: 'single', symbol: 'NVDA' }
        Test: resolveContext(null, 'how is market today') → { mode: 'market', symbol: null }
        Test: resolveContext(null, 'thoughts on AAPL') → { mode: 'single', symbol: 'AAPL' }

Step 2: Update /api/assistant in server.js
        Wire in contextResolver + systemPrompts
        Test: POST /api/assistant with symbol → single-symbol prompt used
        Test: POST /api/assistant without symbol → market prompt used

Step 3: GET /api/assistant/insights endpoint
        Test: returns 2-3 insight cards based on watchlist + positions

Step 4: Options backend endpoints
        GET /api/options/chain/:symbol
        GET /api/options/expirations/:symbol
        POST /api/options/orders
        Test: fetch NVDA options chain, verify Greeks fields present

Step 5: App.js — replace nav with six-tab layout
        Keep React Router for /settings
        Tabs switch content inline, no page navigation
        Test: all six tabs render without errors

Step 6: Overview tab
        Portfolio chart hero (static data first, then wire to real data)
        Scrollable positions + market columns
        AlphaBot sidebar with insights cards
        Test: clicking portfolio chart navigates to Portfolio tab

Step 7: Assistant tab
        Inline AssistantPanel (add inline prop)
        Proactive insights feed from GET /api/assistant/insights
        Test: insights load, clicking action buttons sends correct prompts

Step 8: Research tab
        Expand Research.jsx with fundamentals grid + trade widget
        Symbol pre-fills trade widget
        Test: search NVDA, fundamentals load, trade widget shows NVDA

Step 9: Options tab
        Options.jsx with chain table, order ticket, Greeks panel
        Calls/Both/Puts toggle
        Clicking row populates order ticket + Greeks
        Test: load NVDA chain, click 130C, verify est. cost and Greeks update

Step 10: Portfolio tab
        Consolidate Orders + Positions into single tab
        Add options positions section
        Add P&L breakdown + allocation bars
        Test: all data loads, scrollable columns work

Step 11: Sentiment tab
        Wire existing sentiment components into tab layout
        Clicking watchlist row updates chart
        Test: click TSLA in watchlist, chart updates to TSLA data

Step 12: Mobile polish
        Ensure tab bar is scrollable on narrow screens
        Portfolio card tap → Portfolio tab navigation
        Bottom sheet pattern for assistant input on mobile
```

---

## Files to Create (new)

```
services/contextResolver.js          ← two-state context resolver
services/systemPrompts.js            ← single-symbol + market prompts
client/src/pages/Options.jsx         ← options chain + order ticket
client/src/hooks/useOptionsChain.js  ← fetches chain from /api/options/chain/:symbol
client/src/hooks/useInsights.js      ← fetches from /api/assistant/insights
```

## Files to Modify (existing)

```
server.js
  → import contextResolver + systemPrompts
  → update /api/assistant to use two-prompt system
  → add GET /api/assistant/insights
  → add GET /api/options/chain/:symbol
  → add GET /api/options/expirations/:symbol
  → add POST /api/options/orders

client/src/App.js
  → replace nav links with six-tab state management
  → keep React Router only for /settings

client/src/pages/Dashboard.jsx
  → becomes Overview tab content
  → add portfolio chart hero
  → make positions scrollable
  → add AlphaBot sidebar

client/src/pages/Research.jsx
  → add fundamentals grid
  → add trade widget (symbol pre-filled)
  → add options ideas button

client/src/components/AssistantPanel.jsx
  → add inline prop (renders as panel vs modal/drawer)
  → add mode indicator badge
  → add suggested prompt buttons

client/src/pages/Orders.jsx (currently placeholder)
  → becomes part of Portfolio tab — can be deleted or merged
```

## Files to Keep Unchanged

```
services/reasoningAgent.js           ← Haiku post normalization — working
services/sentimentService.js         ← full pipeline — working
services/sentimentDb.js              ← Azure Table Storage — working
routes/sentiment.js                  ← sentiment CRUD — working
brokers/AlpacaAdapter.js             ← broker abstraction — working
brokers/OandaAdapter.js              ← broker abstraction — working
brokers/brokerFactory.js             ← broker factory — working
services/brokerService.js            ← broker facade — working
services/compressionService.js       ← compression — working
services/cache.js                    ← in-memory cache — working
middleware/auth.js                   ← dev stub — working
All sentiment UI components          ← reuse as-is
All hooks (useAlpaca, etc.)          ← reuse as-is
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Tabs replace React Router navigation | Single-page feel, no URL changes for main content |
| UI symbol always overrides NLP inference | Eliminates false positives, simpler code |
| Two system prompts instead of three modes | Covers 95% of real use cases cleanly |
| Company name map removed | Not needed — UI sets symbol explicitly |
| AssistantPanel gets inline prop | Preserves existing modal behavior for other tabs |
| Options as dedicated tab | Different workflow from stocks, needs its own space |
| Portfolio consolidates Orders + Positions | Single source of truth for portfolio state |
| Insights endpoint is GET not WebSocket | Simpler, cacheable, sufficient for 3x daily updates |
| "Review & place order" goes through AlphaBot first | Safer UX for paper trading — AI reviews before execution |

---

*Architect: Claude (Anthropic) | Project: AlphaBot | Scope: UI redesign + simplified assistant*
