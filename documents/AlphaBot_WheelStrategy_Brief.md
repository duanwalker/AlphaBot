# AlphaBot — Wheel Strategy Module Implementation Brief
*Prepared by Claude (Anthropic) as lead architect*
*Date: May 2026*
*Scope: Wheel Strategy tracker, P/L dashboard, live account
        toggle, strategy-aware assistant integration*

---

## Overview

The wheel strategy is a systematic options income strategy
consisting of two repeating legs:

```
Leg 1: Sell Cash-Secured Put (CSP)
  → Collect premium immediately
  → If stock stays above strike at expiry: keep premium, repeat
  → If stock drops below strike: get assigned (buy 100 shares)

Leg 2 (after assignment): Sell Covered Call (CC)
  → Collect premium on shares you now own
  → If stock stays below strike at expiry: keep premium + shares
  → If stock rises above strike: shares called away, start over

Then back to Leg 1 — the "wheel" completes and repeats
```

This module tracks active wheel positions, calculates
income, surfaces roll/close recommendations, and integrates
with AlphaBot's AI assistant for strategy guidance.

---

## Codebase Context

**Auth:** middleware/auth.js → req.user = { id, tenantId }
**Broker:** services/brokerService.js + brokers/AlpacaAdapter.js
           All broker calls go through BrokerInterface
**Cache:** services/cache.js — in-memory Map, TTL-based
**Storage:** Azure Table Storage via @azure/data-tables
           Connection: AZURE_STORAGE_CONNECTION_STRING (Barterite)
           Existing tables: sentimentSnapshots, sentimentWatchList,
           userProfiles
**Assistant:** /api/assistant in server.js — strategy profile
              already injected into system prompt (Part 3)
**Options:** GET /api/options/chain/:symbol (Massive/Polygon)
            POST /api/options/orders (Alpaca)
            GET /api/options/expirations/:symbol

---

## New .env Variables Required

```bash
# Live Alpaca account (separate from paper)
# Get from Alpaca dashboard → Individual account
ALPACA_LIVE_API_KEY=your_live_key_here
ALPACA_LIVE_SECRET_KEY=your_live_secret_here
ALPACA_LIVE_BASE_URL=https://api.alpaca.markets

# Paper account (already exists — do not change)
# ALPACA_API_KEY=...
# ALPACA_SECRET_KEY=...
# ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

---

## Part 1: Azure Table Storage — New Tables

Add to services/userProfileDb.js OR create
services/wheelDb.js following existing patterns.

### Table: wheelPositions

Tracks every open and closed wheel cycle position.
One row per options contract (CSP or CC).

```javascript
// PartitionKey: userId
// RowKey: positionId (generated UUID)

{
  partitionKey: userId,
  rowKey: positionId,          // e.g. "wheel_20260526_AAPL_001"

  // Position identity
  ticker:       "AAPL",
  contractType: "CSP",         // "CSP" | "CC"
  cycleId:      "cycle_001",   // links CSP and CC of same cycle

  // Contract details
  strike:       180.00,
  expiry:       "2026-06-20",
  contracts:    1,             // number of contracts
  premiumPerContract: 4.20,    // premium received per contract
  totalPremium: 420.00,        // premiumPerContract * contracts * 100

  // Entry
  openedAt:     "2026-05-26T14:32:00Z",
  openPrice:    180.20,        // stock price when opened
  brokerId:     "abc123",      // Alpaca order ID

  // Status tracking
  status:       "open",        // "open" | "expired" | "assigned"
                               // | "called_away" | "closed"
  closedAt:     null,
  closePrice:   null,          // stock price when closed/expired
  closePremium: null,          // premium paid to close (if closed early)
  realizedPL:   null,          // calculated on close

  // Assignment tracking (CSP only)
  assigned:     false,
  assignedAt:   null,
  assignedPrice: null,         // strike price paid for shares
  sharesAcquired: null,        // contracts * 100

  // Called away tracking (CC only)
  calledAway:   false,
  calledAwayAt: null,
  calledAwayPrice: null,

  // Metadata
  notes:        "",            // user notes
  account:      "paper",       // "paper" | "live"
  createdAt:    "2026-05-26T14:32:00Z",
  updatedAt:    "2026-05-26T14:32:00Z",
}
```

### Table: wheelCycles

Tracks complete wheel cycles (one CSP + optional CC).
One row per cycle per ticker.

```javascript
// PartitionKey: userId
// RowKey: cycleId

{
  partitionKey:   userId,
  rowKey:         cycleId,         // "cycle_AAPL_001"

  ticker:         "AAPL",
  cycleNumber:    1,               // nth wheel cycle on this ticker

  // Cycle state
  status:         "csp_open",      // "csp_open" | "assigned"
                                   // | "cc_open" | "complete"

  // CSP leg
  cspPositionId:  "wheel_001",
  cspPremium:     420.00,
  cspStatus:      "open",          // "open" | "expired" | "assigned"

  // CC leg (populated after assignment)
  ccPositionId:   null,
  ccPremium:      null,
  ccStatus:       null,

  // Cost basis (if assigned)
  sharesOwned:    null,
  costBasis:      null,            // strike price - CSP premium received

  // Cycle P/L (calculated on completion)
  totalPremiumCollected: 420.00,
  cycleReturn:    null,            // totalPremium / capitalRequired
  annualizedReturn: null,
  capitalRequired: 18000.00,       // strike * 100 * contracts
  cycleDays:      null,            // days from open to complete
  completedAt:    null,

  account:        "paper",
  createdAt:      "2026-05-26T14:32:00Z",
  updatedAt:      "2026-05-26T14:32:00Z",
}
```

### Table: wheelIncome

Monthly income summary for dashboard display.

```javascript
// PartitionKey: userId
// RowKey: "YYYY-MM" e.g. "2026-05"

{
  partitionKey:      userId,
  rowKey:            "2026-05",
  premiumCollected:  840.00,    // total premium received this month
  cyclesCompleted:   2,
  cyclesOpen:        1,
  assignmentCount:   0,
  calledAwayCount:   0,
  topTicker:         "AAPL",
  updatedAt:         "2026-05-26T14:32:00Z",
}
```

---

## Part 2: Database Service

Create services/wheelDb.js

```javascript
// services/wheelDb.js
import { TableClient } from '@azure/data-tables';
import { v4 as uuidv4 } from 'uuid';

// npm install uuid (if not already installed)

const POSITIONS_TABLE = 'wheelPositions';
const CYCLES_TABLE    = 'wheelCycles';
const INCOME_TABLE    = 'wheelIncome';

function getClient(tableName) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  if (!conn) throw new Error('Missing Azure Storage connection');
  return TableClient.fromConnectionString(conn, tableName);
}

// ── Positions ──────────────────────────────────────────────────

export async function createPosition(userId, positionData) {
  const client = getClient(POSITIONS_TABLE);
  const positionId = `wheel_${Date.now()}_${positionData.ticker}`;
  const entity = {
    partitionKey: userId,
    rowKey:       positionId,
    ...positionData,
    status:       'open',
    assigned:     false,
    calledAway:   false,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  await client.createEntity(entity);
  return entity;
}

export async function updatePosition(userId, positionId, updates) {
  const client = getClient(POSITIONS_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       positionId,
    ...updates,
    updatedAt:    new Date().toISOString(),
  }, 'Merge');
}

export async function getOpenPositions(userId) {
  const client = getClient(POSITIONS_TABLE);
  const positions = [];
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}' and status eq 'open'`
    }
  });
  for await (const entity of iter) {
    positions.push(normalizePosition(entity));
  }
  return positions;
}

export async function getAllPositions(userId, limit = 50) {
  const client = getClient(POSITIONS_TABLE);
  const positions = [];
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'`
    }
  });
  for await (const entity of iter) {
    positions.push(normalizePosition(entity));
    if (positions.length >= limit) break;
  }
  return positions.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function normalizePosition(entity) {
  return {
    positionId:          entity.rowKey,
    userId:              entity.partitionKey,
    ticker:              entity.ticker,
    contractType:        entity.contractType,
    cycleId:             entity.cycleId,
    strike:              parseFloat(entity.strike || 0),
    expiry:              entity.expiry,
    contracts:           parseInt(entity.contracts || 1),
    premiumPerContract:  parseFloat(entity.premiumPerContract || 0),
    totalPremium:        parseFloat(entity.totalPremium || 0),
    openedAt:            entity.openedAt,
    openPrice:           parseFloat(entity.openPrice || 0),
    brokerId:            entity.brokerId || null,
    status:              entity.status,
    closedAt:            entity.closedAt || null,
    closePrice:          entity.closePrice
                           ? parseFloat(entity.closePrice) : null,
    closePremium:        entity.closePremium
                           ? parseFloat(entity.closePremium) : null,
    realizedPL:          entity.realizedPL
                           ? parseFloat(entity.realizedPL) : null,
    assigned:            entity.assigned || false,
    assignedAt:          entity.assignedAt || null,
    assignedPrice:       entity.assignedPrice
                           ? parseFloat(entity.assignedPrice) : null,
    sharesAcquired:      entity.sharesAcquired
                           ? parseInt(entity.sharesAcquired) : null,
    calledAway:          entity.calledAway || false,
    notes:               entity.notes || '',
    account:             entity.account || 'paper',
    createdAt:           entity.createdAt,
    updatedAt:           entity.updatedAt,
  };
}

// ── Cycles ─────────────────────────────────────────────────────

export async function createCycle(userId, cycleData) {
  const client = getClient(CYCLES_TABLE);
  const entity = {
    partitionKey: userId,
    rowKey:       cycleData.cycleId,
    ...cycleData,
    status:       'csp_open',
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  await client.createEntity(entity);
  return entity;
}

export async function updateCycle(userId, cycleId, updates) {
  const client = getClient(CYCLES_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       cycleId,
    ...updates,
    updatedAt:    new Date().toISOString(),
  }, 'Merge');
}

export async function getActiveCycles(userId) {
  const client = getClient(CYCLES_TABLE);
  const cycles = [];
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'
               and status ne 'complete'`
    }
  });
  for await (const entity of iter) {
    cycles.push(entity);
  }
  return cycles;
}

export async function getAllCycles(userId, limit = 50) {
  const client = getClient(CYCLES_TABLE);
  const cycles = [];
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'`
    }
  });
  for await (const entity of iter) {
    cycles.push(entity);
    if (cycles.length >= limit) break;
  }
  return cycles.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// ── Income ─────────────────────────────────────────────────────

export async function updateMonthlyIncome(userId, month, updates) {
  const client = getClient(INCOME_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       month,     // "2026-05"
    ...updates,
    updatedAt:    new Date().toISOString(),
  }, 'Merge');
}

export async function getMonthlyIncome(userId, months = 12) {
  const client = getClient(INCOME_TABLE);
  const records = [];
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'`
    }
  });
  for await (const entity of iter) {
    records.push(entity);
    if (records.length >= months) break;
  }
  return records.sort((a, b) =>
    b.rowKey.localeCompare(a.rowKey)
  );
}
```

---

## Part 3: Live Account Toggle

### Backend: Update brokerService.js

The broker service needs to read the user's trading mode
and use the appropriate credentials:

```javascript
// In services/brokerService.js
// Add trading mode awareness to all broker calls

import { getUserProfile } from './userProfileDb.js';

async function getBrokerConfig(userId, tenantId) {
  // Get user's trading mode from profile
  let tradingMode = 'paper'; // safe default
  try {
    const profile = await getUserProfile(userId, tenantId);
    tradingMode = profile?.tradingMode || 'paper';
  } catch (err) {
    console.warn('[BROKER] Could not read trading mode,
      defaulting to paper:', err.message);
  }

  if (tradingMode === 'live') {
    return {
      apiKey:    process.env.ALPACA_LIVE_API_KEY,
      secretKey: process.env.ALPACA_LIVE_SECRET_KEY,
      baseUrl:   process.env.ALPACA_LIVE_BASE_URL
                   || 'https://api.alpaca.markets',
      mode:      'live',
    };
  }

  return {
    apiKey:    process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    baseUrl:   process.env.ALPACA_BASE_URL
                 || 'https://paper-api.alpaca.markets',
    mode:      'paper',
  };
}
```

### Backend: New toggle endpoint

Add to server.js:

```javascript
// GET current trading mode
app.get('/api/settings/trading-mode', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const profile = await getUserProfile(userId, tenantId);
    const mode = profile?.tradingMode || 'paper';
    res.json({ mode });
  } catch (err) {
    res.json({ mode: 'paper' }); // safe default
  }
});

// PUT toggle trading mode
app.put('/api/settings/trading-mode', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { mode } = req.body;

    if (!['paper', 'live'].includes(mode)) {
      return res.status(400).json({
        error: 'mode must be paper or live'
      });
    }

    // Safety check — confirm live keys exist before
    // allowing switch to live mode
    if (mode === 'live') {
      if (!process.env.ALPACA_LIVE_API_KEY ||
          !process.env.ALPACA_LIVE_SECRET_KEY) {
        return res.status(400).json({
          error: 'Live account API keys not configured.
                  Add ALPACA_LIVE_API_KEY and
                  ALPACA_LIVE_SECRET_KEY to .env'
        });
      }
    }

    // Save to user profile
    await saveUserProfile(userId, tenantId, {
      tradingMode: mode,
    });

    console.log(`[TRADING MODE] ${userId} switched to ${mode}`);
    res.json({ success: true, mode });
  } catch (err) {
    console.error('[TRADING MODE] error:', err.message);
    res.status(500).json({ error: 'Failed to update trading mode' });
  }
});
```

### Frontend: Settings page toggle

Add to client/src/pages/Settings/Preferences.jsx
or create a new TradingAccount.jsx settings sub-page:

```jsx
// Trading mode toggle component
function TradingModeToggle() {
  const [mode, setMode]       = useState('paper');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/api/settings/trading-mode')
      .then(r => r.json())
      .then(data => setMode(data.mode))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(newMode) {
    if (newMode === 'live') {
      // Show confirmation before switching to live
      const confirmed = window.confirm(
        '⚠ Switch to LIVE trading?\n\n' +
        'Real money will be at risk.\n' +
        'All orders will execute against your live ' +
        'Alpaca brokerage account.\n\n' +
        'Make sure you have reviewed AlphaBot\'s ' +
        'recommendations carefully before placing ' +
        'any live trades.'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/trading-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update');
        return;
      }
      setMode(data.mode);
    } catch (err) {
      setError('Failed to update trading mode');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="trading-mode-loading" />;

  return (
    <div className="trading-mode-section">
      <h3>Trading Account</h3>

      {/* Live mode warning banner */}
      {mode === 'live' && (
        <div className="trading-mode-live-warning">
          ⚠ LIVE TRADING ACTIVE — real money at risk
        </div>
      )}

      <div className="trading-mode-toggle">
        <button
          className={`trading-mode-btn ${
            mode === 'paper' ? 'active' : ''
          }`}
          onClick={() => handleToggle('paper')}
          disabled={saving || mode === 'paper'}
        >
          📄 Paper trading
          <span className="trading-mode-desc">
            Simulated — no real money
          </span>
        </button>
        <button
          className={`trading-mode-btn ${
            mode === 'live' ? 'active live' : ''
          }`}
          onClick={() => handleToggle('live')}
          disabled={saving || mode === 'live'}
        >
          💰 Live trading
          <span className="trading-mode-desc">
            Real money — use carefully
          </span>
        </button>
      </div>

      {error && (
        <p className="trading-mode-error">{error}</p>
      )}

      <p className="trading-mode-note">
        {mode === 'paper'
          ? 'Connected to Alpaca paper trading account. Safe to experiment.'
          : 'Connected to Alpaca live brokerage account. All trades use real money.'}
      </p>
    </div>
  );
}
```

### Add tradingMode to userProfiles table

The `tradingMode` field is stored in the existing
`userProfiles` table via `saveUserProfile` with Merge mode.
No new table needed — it's a new field on the existing profile.

---

## Part 4: Wheel Strategy Backend API

Add these routes to server.js:

```javascript
import {
  createPosition,
  updatePosition,
  getOpenPositions,
  getAllPositions,
  createCycle,
  updateCycle,
  getActiveCycles,
  getAllCycles,
  updateMonthlyIncome,
  getMonthlyIncome,
} from './services/wheelDb.js';

// ── Positions ───────────────────────────────────────────────

// GET all open wheel positions
app.get('/api/wheel/positions', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const positions = await getOpenPositions(userId);
    res.json({ positions });
  } catch (err) {
    console.error('[WHEEL] positions error:', err.message);
    res.status(500).json({ error: 'Failed to load positions' });
  }
});

// GET all wheel positions (open + closed history)
app.get('/api/wheel/positions/all', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const limit = parseInt(req.query.limit || '50');
    const positions = await getAllPositions(userId, limit);
    res.json({ positions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load positions' });
  }
});

// POST create new wheel position (manual entry)
app.post('/api/wheel/positions', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const {
      ticker, contractType, strike, expiry,
      contracts, premiumPerContract, openPrice,
      brokerId, cycleId, account, notes
    } = req.body;

    // Validate required fields
    if (!ticker || !contractType || !strike ||
        !expiry || !contracts || !premiumPerContract) {
      return res.status(400).json({
        error: 'ticker, contractType, strike, expiry, ' +
               'contracts, and premiumPerContract are required'
      });
    }

    if (!['CSP', 'CC'].includes(contractType)) {
      return res.status(400).json({
        error: 'contractType must be CSP or CC'
      });
    }

    const totalPremium =
      parseFloat(premiumPerContract) *
      parseInt(contracts) * 100;

    const position = await createPosition(userId, {
      ticker:             ticker.toUpperCase(),
      contractType,
      strike:             parseFloat(strike),
      expiry,
      contracts:          parseInt(contracts),
      premiumPerContract: parseFloat(premiumPerContract),
      totalPremium,
      openPrice:          parseFloat(openPrice || 0),
      brokerId:           brokerId || null,
      cycleId:            cycleId || `cycle_${ticker}_${Date.now()}`,
      account:            account || 'paper',
      notes:              notes || '',
    });

    // Update monthly income
    const month = new Date().toISOString().slice(0, 7);
    await updateMonthlyIncome(userId, month, {
      premiumCollected: totalPremium,
    });

    res.json({ success: true, position });
  } catch (err) {
    console.error('[WHEEL] create position error:', err.message);
    res.status(500).json({ error: 'Failed to create position' });
  }
});

// PUT update position status (expire, assign, close)
app.put('/api/wheel/positions/:positionId', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { positionId } = req.params;
    const updates = req.body;

    // Calculate realized P/L on close
    if (updates.status === 'expired') {
      updates.realizedPL = updates.totalPremium || 0;
      updates.closedAt = new Date().toISOString();
    }

    if (updates.status === 'closed' && updates.closePremium) {
      // Closed early — P/L = premium received - cost to close
      updates.realizedPL =
        (updates.totalPremium || 0) -
        parseFloat(updates.closePremium);
      updates.closedAt = new Date().toISOString();
    }

    await updatePosition(userId, positionId, updates);
    res.json({ success: true });
  } catch (err) {
    console.error('[WHEEL] update position error:', err.message);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// ── Cycles ──────────────────────────────────────────────────

// GET active wheel cycles
app.get('/api/wheel/cycles', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const cycles = await getActiveCycles(userId);
    res.json({ cycles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cycles' });
  }
});

// GET all cycles (including complete)
app.get('/api/wheel/cycles/all', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const cycles = await getAllCycles(userId);
    res.json({ cycles });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cycles' });
  }
});

// ── Income ──────────────────────────────────────────────────

// GET monthly income summary
app.get('/api/wheel/income', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const months = parseInt(req.query.months || '12');
    const income = await getMonthlyIncome(userId, months);
    res.json({ income });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load income' });
  }
});

// ── AI Analysis ─────────────────────────────────────────────

// POST get AlphaBot analysis for a wheel candidate
app.post('/api/wheel/analyze/:ticker', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const ticker = req.params.ticker.toUpperCase();

    // Fetch all context in parallel
    const [fundamentals, sentiment, positions, profile] =
      await Promise.allSettled([
        getFundamentals(ticker, userId, tenantId),
        getSentiment(ticker, userId, tenantId),
        getOpenPositions(userId),
        getUserProfile(userId, tenantId),
      ]);

    const resolve = r =>
      r.status === 'fulfilled' ? r.value : null;

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.3,
      system: `You are AlphaBot, a wheel strategy advisor.
Analyze the provided data and give a specific wheel
strategy recommendation for this ticker.

The wheel strategy involves:
1. Selling cash-secured puts (CSP) below current price
   to collect premium
2. If assigned, selling covered calls (CC) above cost basis
   to collect more premium

Focus your analysis on:
- Is this a good wheel candidate? (stable stock you'd
  want to own, liquid options, reasonable IV)
- Suggested strike and expiry for CSP entry
- Expected premium and annualized return
- Key risks specific to this ticker right now
- Sentiment signal support/resistance for timing

Be specific with numbers. Reference actual strikes
from the options chain if available.`,
      messages: [{
        role: 'user',
        content: `Analyze ${ticker} for wheel strategy entry.

Fundamentals: ${JSON.stringify(
  compressFundamentals(resolve(fundamentals)), null, 2
)}

Sentiment: ${JSON.stringify(
  compressSentiment(resolve(sentiment)), null, 2
)}

Current open wheel positions:
${JSON.stringify(resolve(positions), null, 2)}

User profile: ${JSON.stringify(
  resolve(profile)?.strategyProfile, null, 2
)}`
      }]
    });

    const textBlock = completion.content
      ?.find(b => b.type === 'text');
    const reply = textBlock?.text || 'Analysis unavailable';

    res.json({ ticker, analysis: reply });
  } catch (err) {
    console.error('[WHEEL] analyze error:', err.message);
    res.status(500).json({ error: 'Wheel analysis failed' });
  }
});
```

---

## Part 5: Frontend — Wheel Strategy Tab

The wheel strategy lives in the existing **Options tab** as
a new sub-section, OR as a new dedicated **Wheel** tab.

**Recommendation: Add as a second tab within Options tab.**
The Options tab already has the chain. Add a tab bar
within Options: `Chain | Wheel Tracker`

### File: client/src/pages/Options.jsx (update)

Add an inner tab bar at the top of Options:

```jsx
const [optionsView, setOptionsView] = useState('chain');

// Inner tab bar:
<div className="options-inner-tabs">
  <button
    className={`options-inner-tab ${
      optionsView === 'chain' ? 'active' : ''
    }`}
    onClick={() => setOptionsView('chain')}
  >
    Options Chain
  </button>
  <button
    className={`options-inner-tab ${
      optionsView === 'wheel' ? 'active' : ''
    }`}
    onClick={() => setOptionsView('wheel')}
  >
    Wheel Tracker
  </button>
</div>

{optionsView === 'chain' && <OptionsChainView ... />}
{optionsView === 'wheel' && <WheelTracker />}
```

### File: client/src/components/WheelTracker.jsx (new)

```jsx
// client/src/components/WheelTracker.jsx
import { useState, useEffect } from 'react';

export default function WheelTracker() {
  const [positions, setPositions]   = useState([]);
  const [cycles, setCycles]         = useState([]);
  const [income, setIncome]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeView, setActiveView] = useState('dashboard');
  // 'dashboard' | 'positions' | 'history' | 'add'

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [posRes, cycRes, incRes] = await Promise.all([
        fetch('/api/wheel/positions').then(r => r.json()),
        fetch('/api/wheel/cycles').then(r => r.json()),
        fetch('/api/wheel/income').then(r => r.json()),
      ]);
      setPositions(posRes.positions || []);
      setCycles(cycRes.cycles || []);
      setIncome(incRes.income || []);
    } finally {
      setLoading(false);
    }
  }

  // Calculate totals for dashboard
  const totalPremiumOpen = positions.reduce(
    (sum, p) => sum + (p.totalPremium || 0), 0
  );
  const currentMonthIncome = income[0]?.premiumCollected || 0;
  const openCSPs = positions.filter(p =>
    p.contractType === 'CSP'
  );
  const openCCs = positions.filter(p =>
    p.contractType === 'CC'
  );

  return (
    <div className="wheel-tracker">

      {/* Dashboard summary cards */}
      <div className="wheel-stat-cards">
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">
            This month
          </div>
          <div className="wheel-stat-value green">
            ${currentMonthIncome.toFixed(2)}
          </div>
          <div className="wheel-stat-sub">
            Premium collected
          </div>
        </div>
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">
            Open positions
          </div>
          <div className="wheel-stat-value">
            {positions.length}
          </div>
          <div className="wheel-stat-sub">
            {openCSPs.length} CSP · {openCCs.length} CC
          </div>
        </div>
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">
            Capital at work
          </div>
          <div className="wheel-stat-value">
            ${positions.reduce((sum, p) =>
              sum + (p.strike * p.contracts * 100), 0
            ).toLocaleString()}
          </div>
          <div className="wheel-stat-sub">
            Across all positions
          </div>
        </div>
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">
            Active cycles
          </div>
          <div className="wheel-stat-value">
            {cycles.length}
          </div>
          <div className="wheel-stat-sub">
            Tickers in rotation
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="wheel-actions">
        <button
          className="btn-primary"
          onClick={() => setActiveView('add')}
        >
          + Log new position
        </button>
        <button
          className="btn-secondary"
          onClick={() => setActiveView('history')}
        >
          View history
        </button>
      </div>

      {/* Open positions table */}
      {loading ? (
        <div className="wheel-loading">
          Loading positions…
        </div>
      ) : positions.length === 0 ? (
        <div className="wheel-empty">
          <p>No open wheel positions yet.</p>
          <p className="muted">
            Log your first position using the button above,
            or ask AlphaBot for wheel strategy candidates.
          </p>
          <button
            className="btn-secondary"
            onClick={() => {/* open assistant */}}
          >
            Ask AlphaBot for candidates ↗
          </button>
        </div>
      ) : (
        <WheelPositionsTable
          positions={positions}
          onUpdate={loadData}
        />
      )}

      {/* Add position form */}
      {activeView === 'add' && (
        <AddPositionModal
          onSave={async (data) => {
            await fetch('/api/wheel/positions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            await loadData();
            setActiveView('dashboard');
          }}
          onClose={() => setActiveView('dashboard')}
        />
      )}

    </div>
  );
}

// ── Positions table ─────────────────────────────────────────

function WheelPositionsTable({ positions, onUpdate }) {
  return (
    <div className="wheel-positions">
      <table className="wheel-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Type</th>
            <th>Strike</th>
            <th>Expiry</th>
            <th>Contracts</th>
            <th>Premium</th>
            <th>Days left</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => (
            <WheelPositionRow
              key={pos.positionId}
              position={pos}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WheelPositionRow({ position: pos, onUpdate }) {
  const daysToExpiry = Math.ceil(
    (new Date(pos.expiry) - new Date()) /
    (1000 * 60 * 60 * 24)
  );
  const isExpiringSoon = daysToExpiry <= 7;
  const isExpired = daysToExpiry <= 0;

  async function handleExpire() {
    await fetch(`/api/wheel/positions/${pos.positionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'expired',
        totalPremium: pos.totalPremium,
      }),
    });
    onUpdate();
  }

  async function handleAssign() {
    await fetch(`/api/wheel/positions/${pos.positionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'assigned',
        assigned: true,
        assignedAt: new Date().toISOString(),
        assignedPrice: pos.strike,
        sharesAcquired: pos.contracts * 100,
      }),
    });
    onUpdate();
  }

  return (
    <tr className={isExpiringSoon ? 'expiring-soon' : ''}>
      <td className="wheel-ticker">{pos.ticker}</td>
      <td>
        <span className={`wheel-type-badge ${
          pos.contractType === 'CSP' ? 'csp' : 'cc'
        }`}>
          {pos.contractType}
        </span>
      </td>
      <td>${pos.strike.toFixed(2)}</td>
      <td>{pos.expiry}</td>
      <td>{pos.contracts}</td>
      <td className="green">
        ${pos.totalPremium.toFixed(2)}
      </td>
      <td className={isExpiringSoon ? 'warning' : ''}>
        {isExpired ? 'Expired' : `${daysToExpiry}d`}
      </td>
      <td>
        <span className="wheel-status open">
          ● Open
        </span>
      </td>
      <td>
        <div className="wheel-row-actions">
          <button
            className="btn-small"
            onClick={handleExpire}
            title="Mark as expired worthless"
          >
            Expired
          </button>
          {pos.contractType === 'CSP' && (
            <button
              className="btn-small btn-warning"
              onClick={handleAssign}
              title="Mark as assigned"
            >
              Assigned
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Add position modal ──────────────────────────────────────

function AddPositionModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    ticker:             '',
    contractType:       'CSP',
    strike:             '',
    expiry:             '',
    contracts:          1,
    premiumPerContract: '',
    openPrice:          '',
    account:            'paper',
    notes:              '',
  });

  const estimatedIncome = form.premiumPerContract &&
    form.contracts
      ? parseFloat(form.premiumPerContract) *
        parseInt(form.contracts) * 100
      : 0;

  const capitalRequired = form.strike && form.contracts &&
    form.contractType === 'CSP'
      ? parseFloat(form.strike) *
        parseInt(form.contracts) * 100
      : 0;

  const annualizedReturn = estimatedIncome &&
    capitalRequired && form.expiry
      ? (() => {
          const days = Math.ceil(
            (new Date(form.expiry) - new Date()) /
            (1000 * 60 * 60 * 24)
          );
          return days > 0
            ? ((estimatedIncome / capitalRequired) *
               (365 / days) * 100).toFixed(1)
            : 0;
        })()
      : null;

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  return (
    <div className="wheel-modal-overlay">
      <div className="wheel-modal">
        <div className="wheel-modal-header">
          <h3>Log wheel position</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="wheel-modal-body">
          {/* Type toggle */}
          <div className="wheel-type-toggle">
            <button
              className={form.contractType === 'CSP'
                ? 'active' : ''}
              onClick={() => update('contractType', 'CSP')}
            >
              Cash-Secured Put (CSP)
            </button>
            <button
              className={form.contractType === 'CC'
                ? 'active' : ''}
              onClick={() => update('contractType', 'CC')}
            >
              Covered Call (CC)
            </button>
          </div>

          {/* Form fields */}
          <div className="wheel-form-grid">
            <div className="wheel-form-field">
              <label>Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => update('ticker',
                  e.target.value.toUpperCase()
                )}
                placeholder="e.g. AAPL"
              />
            </div>
            <div className="wheel-form-field">
              <label>Strike price</label>
              <input
                type="number"
                value={form.strike}
                onChange={e => update('strike',
                  e.target.value
                )}
                placeholder="e.g. 180.00"
              />
            </div>
            <div className="wheel-form-field">
              <label>Expiry date</label>
              <input
                type="date"
                value={form.expiry}
                onChange={e => update('expiry',
                  e.target.value
                )}
              />
            </div>
            <div className="wheel-form-field">
              <label>Contracts</label>
              <input
                type="number"
                value={form.contracts}
                onChange={e => update('contracts',
                  e.target.value
                )}
                min="1"
              />
            </div>
            <div className="wheel-form-field">
              <label>Premium per contract ($)</label>
              <input
                type="number"
                value={form.premiumPerContract}
                onChange={e => update('premiumPerContract',
                  e.target.value
                )}
                placeholder="e.g. 4.20"
                step="0.01"
              />
            </div>
            <div className="wheel-form-field">
              <label>Stock price at entry</label>
              <input
                type="number"
                value={form.openPrice}
                onChange={e => update('openPrice',
                  e.target.value
                )}
                placeholder="e.g. 185.40"
              />
            </div>
          </div>

          {/* Live calculations */}
          {estimatedIncome > 0 && (
            <div className="wheel-calc-preview">
              <div className="wheel-calc-row">
                <span>Premium income</span>
                <span className="green">
                  +${estimatedIncome.toFixed(2)}
                </span>
              </div>
              {capitalRequired > 0 && (
                <div className="wheel-calc-row">
                  <span>Capital required</span>
                  <span>
                    ${capitalRequired.toLocaleString()}
                  </span>
                </div>
              )}
              {annualizedReturn && (
                <div className="wheel-calc-row">
                  <span>Annualized return</span>
                  <span className="green">
                    {annualizedReturn}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Account selector */}
          <div className="wheel-form-field">
            <label>Account</label>
            <select
              value={form.account}
              onChange={e => update('account', e.target.value)}
            >
              <option value="paper">Paper trading</option>
              <option value="live">Live account</option>
            </select>
          </div>

          <div className="wheel-form-field">
            <label>Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="e.g. earnings play, support level"
            />
          </div>
        </div>

        <div className="wheel-modal-footer">
          <button
            className="btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => onSave(form)}
            disabled={!form.ticker || !form.strike ||
                      !form.expiry || !form.premiumPerContract}
          >
            Log position
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Part 6: Income Dashboard

Add a monthly income chart to the Wheel Tracker dashboard.
Uses Recharts (already installed):

```jsx
// Inside WheelTracker.jsx — income chart section
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

function IncomeChart({ income }) {
  const chartData = income
    .slice(0, 6)
    .reverse()
    .map(m => ({
      month: m.rowKey,  // "2026-05"
      income: parseFloat(m.premiumCollected || 0),
    }));

  if (chartData.length === 0) {
    return (
      <div className="wheel-income-empty">
        Income chart will appear after your first
        completed position.
      </div>
    );
  }

  return (
    <div className="wheel-income-chart">
      <div className="wheel-section-title">
        Monthly premium income
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border-tertiary)"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            tickFormatter={m => {
              const [y, mo] = m.split('-');
              return new Date(y, mo - 1)
                .toLocaleDateString('en-US', {
                  month: 'short'
                });
            }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={v => `$${v}`}
          />
          <Tooltip
            formatter={v => [`$${v.toFixed(2)}`, 'Premium']}
          />
          <Bar
            dataKey="income"
            fill="#1D9E75"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## Part 7: Strategy-Aware Assistant Integration

Update the wheel analysis to be available from the
Assistant tab. The existing insight cards should surface
wheel opportunities when the user's active strategies
include wheel_strategy.

Update `/api/assistant/insights` in server.js:

```javascript
// In /api/assistant/insights handler
// Add wheel-specific insights when profile includes wheel

const profile = await getUserProfile(userId, tenantId)
  .catch(() => null);

const isWheelUser = profile?.activeStrategies
  ?.includes('wheel_strategy');

if (isWheelUser) {
  // Check watchlist sentiment for wheel candidates
  // High sentiment + moderate IV = good CSP entry
  sentimentResults.forEach((result, i) => {
    if (result.status !== 'fulfilled' || !result.value)
      return;
    const snap = result.value;
    const ticker = watchlist[i];

    // Wheel opportunity: bullish sentiment,
    // high signal, stable or rising trend
    if (
      snap.sentimentScore >= 0.65 &&
      snap.signalStrength === 'high' &&
      (snap.trend === 'rising' || snap.trend === 'stable')
    ) {
      insights.push({
        type: 'opportunity',
        ticker,
        title: `${ticker} — wheel strategy candidate`,
        body: `Sentiment ${snap.sentimentScore.toFixed(2)} ` +
              `with ${snap.signalStrength} signal. ` +
              `Consider selling a cash-secured put below ` +
              `current price to collect premium.`,
        action: `Analyze ${ticker} for a wheel strategy ` +
                `entry — suggest a CSP strike and expiry`,
        timestamp: snap.timestamp,
      });
    }
  });
}
```

---

## File Structure Summary

```
New files to create:
  services/wheelDb.js              ← Azure Table Storage
  client/src/components/
    WheelTracker.jsx               ← Main wheel UI component

Files to modify:
  server.js
    → import wheelDb functions
    → add GET/POST/PUT /api/wheel/positions
    → add GET /api/wheel/cycles
    → add GET /api/wheel/income
    → add POST /api/wheel/analyze/:ticker
    → add GET/PUT /api/settings/trading-mode
    → update /api/assistant/insights for wheel

  services/brokerService.js
    → add getBrokerConfig() trading mode awareness
    → use live vs paper keys based on tradingMode

  services/userProfileDb.js
    → tradingMode field already supported via Merge
      no schema changes needed

  client/src/pages/Options.jsx
    → add inner Chain | Wheel Tracker tab bar
    → render WheelTracker component

  client/src/pages/Settings/
    → add TradingModeToggle component
    → wire into Settings layout
```

---

## Implementation Order for Copilot

```
Step 1: services/wheelDb.js
        Test: createPosition, getOpenPositions work
              against Azure Table Storage

Step 2: Wheel API routes in server.js
        Test: POST /api/wheel/positions creates entry
              GET /api/wheel/positions returns it
              PUT /api/wheel/positions/:id updates status

Step 3: Live account toggle
        server.js GET/PUT /api/settings/trading-mode
        brokerService.js trading mode awareness
        Test: toggle to live returns 400 if no live keys
              toggle to paper always works

Step 4: Settings UI — TradingModeToggle component
        Test: paper/live buttons render
              switching to live shows confirmation dialog
              live warning banner shows when in live mode

Step 5: WheelTracker.jsx component
        Test: renders with empty state correctly
              Add position modal calculates premium,
              capital required, annualized return correctly
              Log position saves to database
              Expire/assign buttons update status

Step 6: Wire WheelTracker into Options.jsx
        Test: Chain | Wheel Tracker inner tabs work
              WheelTracker shows saved positions

Step 7: Income chart (IncomeChart component)
        Test: chart renders when income data exists
              shows empty state when no income yet

Step 8: Update /api/assistant/insights for wheel
        Test: wheel user gets CSP opportunity cards
              non-wheel user does not get wheel cards

Step 9: Production build passes
Step 10: All tabs render without errors
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Manual position entry (not auto-sync from Alpaca) | Options approval pending; works immediately for paper tracking and manual logging of real trades |
| wheelPositions + wheelCycles as separate tables | Positions track individual contracts; cycles track the full wheel (CSP→assigned→CC→complete) |
| Income table updated on position creation | Pre-aggregated for fast dashboard queries without scanning all positions |
| WheelTracker inside Options tab (inner tabs) | Keeps options-related features together; doesn't require new top-level tab |
| Live/paper toggle requires confirmation dialog | Accidental switches to live mode with real money is a serious risk |
| Trading mode stored in userProfiles (Merge) | Reuses existing infrastructure; no new table needed |
| Annualized return calculated client-side | Simple math, fast, no API call needed |
| Wheel insight cards filtered by strategy profile | Users without wheel strategy don't see irrelevant CSP alerts |

---

*Architect: Claude (Anthropic) | Project: AlphaBot | Scope: Wheel Strategy Module*
