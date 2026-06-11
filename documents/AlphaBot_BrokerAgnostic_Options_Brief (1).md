# AlphaBot — Broker-Agnostic Options Architecture Brief

**Prepared by:** Claude (Anthropic) — Lead Architect  
**Project:** AlphaBot  
**Date:** June 2026  
**Scope:** Options chain data + order execution via extensible broker interface  
**Status:** Ready for implementation  

---

## Confidence Levels & Sources

| Claim | Confidence | Source |
|---|---|---|
| Alpaca options chain endpoint | High | docs.alpaca.markets (verified June 2026) |
| Alpaca paper account supports options | High | docs.alpaca.markets/us/docs/options-trading |
| Schwab has options chain API | High | developer.schwab.com |
| Schwab uses OAuth 2.0 | High | developer.schwab.com |
| Schwab historical options data unavailable | High | github.com/alexgolec/schwab-py |
| BrokerInterface already exists in codebase | High | Reviewed in session |
| AlpacaAdapter already exists in codebase | High | Reviewed in session |

---

## Problem Statement

The options chain in AlphaBot is currently broken. Polygon's
`v3/snapshot/options` endpoint requires a paid plan and returns 403
for all requests regardless of ticker or expiry date. There is also
a secondary bug where the expiration dropdown stops at early dates
because the expirations endpoint paginates but the code never
fetches beyond the first page.

More importantly, the original implementation hard-coded Polygon
as the options data source in server.js routes directly. This
approach would prevent future users from using their own broker
(Schwab, Tradier, IBKR, etc.) for both chain data and order
execution — a serious architectural problem for a SaaS product.

---

## Design Principles

**1. Server routes never call a broker API directly.**  
All options data and order execution flows through `BrokerInterface`
methods. Server routes call `broker.getOptionsChain()` — never
`fetch('https://data.alpaca.markets/...')` directly.

**2. Each adapter is fully self-contained.**  
`AlpacaAdapter` knows about Alpaca URLs, auth headers, and response
shapes. `SchwabAdapter` will know about Schwab's OAuth flow and its
own response shapes. Neither leaks into shared code.

**3. The normalized contract shape is broker-neutral.**  
Every adapter returns the same contract object regardless of source.
The frontend never needs to change when a new broker is added.

**4. Data and execution use the same adapter.**  
A user connected to Schwab gets Schwab chain data AND executes
through Schwab. There is no mixing of data source and execution
broker per user session.

**5. Additive changes only.**  
No existing broker methods are removed or modified. All new methods
are additions to the existing interface and adapters.

---

## BrokerInterface — Three New Methods

Add to `brokers/BrokerInterface.js` alongside existing
methods. Do not remove or modify anything currently there.

```javascript
/**
 * Returns available expiration dates for a symbol.
 *
 * @param {string} symbol - Underlying ticker e.g. 'AAPL'
 * @returns {Promise<string[]>} - Sorted array of 'YYYY-MM-DD' strings
 */
async getOptionsExpirations(symbol) {
  throw new Error('getOptionsExpirations not implemented');
}

/**
 * Returns the full options chain for a symbol and expiry.
 *
 * @param {string} symbol      - Underlying ticker e.g. 'AAPL'
 * @param {string} expiration  - 'YYYY-MM-DD'
 * @param {object} filters     - Optional: { type: 'call'|'put',
 *                                           strikeMin, strikeMax }
 * @returns {Promise<NormalizedContract[]>}
 */
async getOptionsChain(symbol, expiration, filters = {}) {
  throw new Error('getOptionsChain not implemented');
}

/**
 * Places an options order.
 *
 * @param {object} order - Normalized order object (see spec below)
 * @returns {Promise<OrderResult>}
 */
async placeOptionsOrder(order) {
  throw new Error('placeOptionsOrder not implemented');
}
```

---

## Normalized Contract Shape

Every adapter **must** return contracts in this exact shape.
This is what the frontend consumes and what the wheel tracker logs.
Adapters are responsible for mapping their broker's response
format to this shape before returning.

```javascript
{
  symbol:            string,  // Full contract symbol
                              // e.g. 'AAPL240718P00180000'
  underlying:        string,  // e.g. 'AAPL'
  contractType:      string,  // 'call' | 'put'
  strike:            number,  // e.g. 180.00
  expiry:            string,  // 'YYYY-MM-DD' e.g. '2024-07-18'
  bid:               number,
  ask:               number,
  last:              number,
  volume:            number,
  openInterest:      number,
  impliedVolatility: number,  // Decimal e.g. 0.32 (not percentage)
  greeks: {
    delta:           number,
    gamma:           number,
    theta:           number,
    vega:            number,
  }
}
```

---

## Normalized Order Shape

Input to `placeOptionsOrder()`. Adapters map this to their
broker's specific order payload internally.

```javascript
{
  symbol:      string,  // Contract symbol e.g. 'AAPL240718P00180000'
  side:        string,  // 'buy_to_open'  | 'sell_to_open' |
                        // 'buy_to_close' | 'sell_to_close'
  qty:         number,  // Number of contracts
  orderType:   string,  // 'market' | 'limit'
  limitPrice:  number,  // Required when orderType === 'limit'
  timeInForce: string,  // 'day' | 'gtc'
}
```

---

## AlpacaAdapter — Implementation Details

*Source: docs.alpaca.markets — verified June 2026. Confidence: High.*

### Authentication

All Alpaca requests use header-based API key auth — no OAuth needed.
Use the existing `getBrokerConfig(userId, tenantId)` function
already built in `services/brokerService.js` (added in Wheel
Strategy Step 3) to get the correct keys for paper vs live mode.

```javascript
// Headers for all Alpaca requests
{
  'APCA-API-KEY-ID':     config.apiKey,
  'APCA-API-SECRET-KEY': config.secretKey,
  'accept':              'application/json',
}
```

### getOptionsExpirations(symbol)

Replaces the broken Polygon reference endpoint. Fixes the
pagination bug that caused the dropdown to stop at early dates.

```
Endpoint: GET https://paper-api.alpaca.markets/v2/options/contracts
Params:
  underlying_symbols: symbol   (e.g. 'AAPL')
  status:             active
  limit:              10000
Auth: APCA headers (paper keys)
```

**Implementation notes:**
- Extract unique `expiration_date` values from the contracts array
- Sort ascending and deduplicate before returning
- Returns `string[]` of `'YYYY-MM-DD'` values
- The Alpaca default only returns contracts expiring before the
  upcoming weekend — pass `expiration_date_gte` set to today's
  date to get the full calendar

**Return:** `['2026-06-18', '2026-07-18', '2026-08-15', ...]`

---

### getOptionsChain(symbol, expiration, filters)

Replaces the broken Polygon snapshot endpoint (the one returning 403).

```
Endpoint: GET https://data.alpaca.markets/v1beta1/options/snapshots/{symbol}
Params:
  expiration_date:    expiration   (e.g. '2026-07-18')
  feed:               indicative
  limit:              250
  type:               filters.type (optional: 'call' or 'put')
  strike_price_gte:   filters.strikeMin (optional)
  strike_price_lte:   filters.strikeMax (optional)
Auth: APCA headers (paper keys)
```

**Alpaca response shape:**
```javascript
{
  snapshots: {
    "AAPL240718P00180000": {
      latestTrade: { p: 4.20, s: 10, ... },
      latestQuote: { ap: 4.30, bp: 4.10, as: 5, bs: 8 },
      greeks: { delta: -0.32, gamma: 0.04,
                theta: -0.08, vega: 0.18, rho: -0.02 },
      impliedVolatility: 0.285,
      openInterest: 1250,
    },
    ...
  }
}
```

**Contract symbol parsing** (to extract type, strike, expiry):
```javascript
// Symbol format: AAPL240718P00180000
// Positions:     [0-3]=ticker  [4-9]=YYMMDD  [10]=C/P
//                [11-18]=strike*1000 (8 digits, zero-padded)

function parseContractSymbol(sym) {
  // Find where digits start (after variable-length ticker)
  const match = sym.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, underlying, dateStr, typeChar, strikeStr] = match;
  return {
    underlying,
    contractType: typeChar === 'C' ? 'call' : 'put',
    expiry: `20${dateStr.slice(0,2)}-${dateStr.slice(2,4)}-${dateStr.slice(4,6)}`,
    strike: parseInt(strikeStr) / 1000,
  };
}
```

**If response has no snapshots:** return `{ results: [] }`  
**If Alpaca returns an error:** log it and return `{ results: [], error: message }`

---

### placeOptionsOrder(order)

Maps the normalized order to Alpaca's order API.

```
Endpoint: POST {baseUrl}/v2/orders
Auth: APCA headers
baseUrl: from getBrokerConfig() — paper or live based on tradingMode
```

**Mapping normalized side to Alpaca fields:**

| Normalized side  | Alpaca side | Alpaca position_intent |
|---|---|---|
| buy_to_open      | buy         | open                   |
| sell_to_open     | sell        | open                   |
| buy_to_close     | buy         | close                  |
| sell_to_close    | sell        | close                  |

**Alpaca order payload:**
```javascript
{
  symbol:          order.symbol,
  qty:             order.qty.toString(),
  side:            mappedSide,          // 'buy' or 'sell'
  type:            order.orderType,     // 'market' or 'limit'
  time_in_force:   order.timeInForce,   // 'day' or 'gtc'
  limit_price:     order.limitPrice?.toString(),  // if limit order
  position_intent: mappedIntent,        // 'open' or 'close'
}
```

**Return shape:**
```javascript
{
  orderId:  string,   // Alpaca order ID
  status:   string,   // 'accepted' | 'pending_new' | etc.
  symbol:   string,
  side:     string,
  qty:      number,
  filledAt: string | null,
}
```

---

## SchwabAdapter — Stub (Future)

*Source: developer.schwab.com. Confidence: Medium on API shape;
OAuth implementation not yet designed.*

Create `brokers/SchwabAdapter.js` as a stub at the same
time AlpacaAdapter is extended. This validates the interface
contract works for a second broker even before Schwab is
fully implemented.

**Key differences vs Alpaca to plan for:**
- Uses OAuth 2.0 with token refresh — not simple API key headers.
  Will require a separate token management service.
- Options chain endpoint: `GET /marketdata/v1/chains`
- Order endpoint: `POST /trader/v1/accounts/{accountId}/orders`
- Historical options data is NOT available via Schwab API.
- Developer app approval takes several days — start early.
- Requires a Schwab brokerage account linked to the developer app.

**Stub implementation:**
```javascript
// brokers/SchwabAdapter.js
export class SchwabAdapter {
  async getOptionsExpirations(symbol) {
    throw new Error('SchwabAdapter: getOptionsExpirations not yet implemented');
  }
  async getOptionsChain(symbol, expiration, filters = {}) {
    throw new Error('SchwabAdapter: getOptionsChain not yet implemented');
  }
  async placeOptionsOrder(order) {
    throw new Error('SchwabAdapter: placeOptionsOrder not yet implemented');
  }
}
```

---

## Server Route Updates

Update `server.js` — the two options routes that currently call
Polygon directly. No other routes need to change.

```javascript
// GET /api/options/expirations/:symbol
// BEFORE: Called Polygon reference endpoint with pagination bug
// AFTER:  Calls broker.getOptionsExpirations()

app.get('/api/options/expirations/:symbol',
  authenticateToken, async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const broker = await getBrokerForUser(userId, tenantId);
    const expirations = await broker.getOptionsExpirations(symbol);
    res.json({ expirations });
  } catch (err) {
    console.error('[OPTIONS] expirations error:', err.message);
    res.status(500).json({ error: 'Failed to load expirations' });
  }
});

// GET /api/options/chain/:symbol
// BEFORE: Called Polygon snapshot endpoint (returns 403)
// AFTER:  Calls broker.getOptionsChain()

app.get('/api/options/chain/:symbol',
  authenticateToken, async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const { expiration, type, strikeMin, strikeMax } = req.query;
    const broker = await getBrokerForUser(userId, tenantId);
    const results = await broker.getOptionsChain(
      symbol, expiration,
      { type, strikeMin, strikeMax }
    );
    res.json({ results });
  } catch (err) {
    console.error('[OPTIONS] chain error:', err.message);
    res.status(500).json({ error: 'Failed to load options chain' });
  }
});
```

**Note:** `getBrokerForUser(userId, tenantId)` is a helper that
reads the user's broker preference (currently always Alpaca) and
returns the appropriate adapter instance. Add this helper to
`services/brokerService.js` alongside `getBrokerConfig()`.

---

## Repo Structure (Confirmed from GitHub)

The following top-level folders are relevant to this implementation:

```
AlphaBot/
├── brokers/              ← BrokerInterface.js + AlpacaAdapter.js live here
├── services/             ← brokerService.js, wheelDb.js etc. live here
├── server.js             ← API routes
├── client/               ← React frontend
└── tests/wheel/          ← All wheel strategy tests
```

Note: broker adapters are in `brokers/` at root, NOT inside `services/`.
All path references in this brief reflect the actual repo structure.

---

## File Change Summary

```
Modify:
  brokers/BrokerInterface.js
    → Add getOptionsExpirations(), getOptionsChain(),
      placeOptionsOrder() stubs (additive only)

  brokers/AlpacaAdapter.js
    → Implement all three new methods
    → Use getBrokerConfig() for paper/live URL switching

  services/brokerService.js
    → Add getBrokerForUser(userId, tenantId) helper
      Returns correct adapter instance based on user preference
      Currently always returns AlpacaAdapter
      Designed to support SchwabAdapter etc. in future

  server.js
    → GET /api/options/expirations/:symbol
      Replace Polygon call with broker.getOptionsExpirations()
    → GET /api/options/chain/:symbol
      Replace Polygon call with broker.getOptionsChain()
    → POST /api/options/orders (confirm already using interface
      or update to use broker.placeOptionsOrder())

Create:
  brokers/SchwabAdapter.js
    → Stub only — all three methods throw 'not implemented'
    → Validates interface contract works for second adapter

Do NOT modify:
  Polygon integration — still used for other market data
  Existing broker methods — all changes are additive
  WheelTracker, wheelDb, or wheel routes — unchanged
  Any existing tests — new tests cover new methods only
```

---

## Implementation Order for Claude Code + Copilot

```
Step 1: Add getBrokerForUser() to brokerService.js
        Returns AlpacaAdapter instance (hardcoded for now)
        Designed to accept broker preference in future
        Test: returns an object with getOptionsChain method

Step 2: Extend BrokerInterface with three new method stubs
        Test: interface imports cleanly, methods throw correctly

Step 3: Implement AlpacaAdapter.getOptionsExpirations()
        Test: returns sorted string[] for AAPL
              includes July and August expirations
              no duplicates in result

Step 4: Implement AlpacaAdapter.getOptionsChain()
        Test: returns NormalizedContract[] for AAPL + expiry
              contractType is 'call' or 'put' (lowercase)
              strike is a number (not string)
              greeks object present with delta/gamma/theta/vega

Step 5: Implement AlpacaAdapter.placeOptionsOrder()
        Test: maps sell_to_open → side:'sell', intent:'open'
              maps buy_to_close → side:'buy', intent:'close'
              routes to paper vs live URL from getBrokerConfig()
              limit_price omitted for market orders

Step 6: Update server.js options routes
        Test: GET /api/options/chain/AAPL?expiration=2026-07-18
              returns real contract data (not 403)
              GET /api/options/expirations/AAPL
              returns dates beyond July 2026

Step 7: Create SchwabAdapter stub
        Test: instantiates without error
              all three methods throw 'not implemented'
              implements same interface as AlpacaAdapter

Step 8: Integration smoke test in browser
        Options Chain tab loads AAPL data for July expiry
        Wheel Tracker tab unaffected
        No console errors
```

---

## Backlog Items (Not This Session)

These are tracked but not part of this implementation:

**Shared Sentiment Cache** — currently each user gets their own
sentiment snapshots even for the same symbol, duplicating API
calls and Azure storage. Before multi-user launch, redesign
`sentimentSnapshots` with a shared cache keyed by
`symbol + timestamp`, with user watchlists as symbol references
only. Significant API cost reduction at scale.

**Full SchwabAdapter** — OAuth 2.0 token management, chain
mapping, order execution. Requires Schwab developer app approval
(allow several days) and design of token refresh service.

**Auto-sync from Broker** — when a real options order is placed
through AlphaBot's order ticket, auto-detect and log it to the
Wheel Tracker rather than requiring manual entry. Depends on
order execution being fully wired first.

**Pre-trade Risk Check** — before `placeOptionsOrder()` executes,
validate buying power, position limits, and account approval level.
Alpaca returns a clear error on level violations but a pre-check
improves UX.

---

*Architect: Claude (Anthropic) | Project: AlphaBot*  
*Module: Broker-Agnostic Options | Version: 1.0*
