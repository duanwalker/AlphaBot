# AlphaBot — AI-Powered Semi-Automated Trading Assistant

A React web app you run locally in your browser. The AI (Claude) generates
trade ideas, market research, and portfolio insights. You review and approve
every trade before it executes.

---

## What it does

| Feature | Description |
|---|---|
| **Portfolio** | Live positions from Alpaca + OANDA, P&L, equity curve, AI insights |
| **AI Signals** | Claude scans your watchlist and generates BUY/SELL/WATCH signals |
| **Research** | Ask any question about a stock, forex pair, or macro event |
| **Pending Trades** | Review AI trade ideas, approve/reject, or ask AI to modify them |
| **Settings** | Configure API keys, risk controls, signal preferences |

---

## Tech stack

```
alphabot/
├── server.js           ← Node/Express backend (talks to brokers + Anthropic)
├── server-package.json ← Backend dependencies
├── .env                ← Your API keys (never commit this!)
├── src/
│   ├── App.js          ← Main app shell + tab routing
│   ├── App.css         ← All styles
│   ├── components/
│   │   ├── Portfolio.js  ← Holdings, P&L, equity curve, AI insights
│   │   ├── Signals.js    ← Watchlist + AI signal generation
│   │   ├── Research.js   ← Free-form AI market research
│   │   ├── Trades.js     ← Pending trade approval + execution
│   │   └── Settings.js   ← API config + risk controls
│   └── services/
│       └── api.js        ← All API calls (Alpaca, OANDA, Anthropic, AV)
└── public/
    └── index.html
```

---

## Setup — step by step

### 1. Prerequisites

- **Node.js** 18+ — download from https://nodejs.org
- **VS Code** (recommended) — download from https://code.visualstudio.com
- A terminal (VS Code has one built in: View → Terminal)

### 2. Install dependencies

You need to install packages for both the backend server and the React frontend.

```bash
# --- Backend server ---
cd alphabot
cp server-package.json package-server.json   # already included
npm install --prefix . express cors dotenv @anthropic-ai/sdk nodemon

# --- React frontend ---
npm install
```

Or run the install script:
```bash
cd alphabot
npm install && npm install express cors dotenv @anthropic-ai/sdk nodemon
```

### 3. Configure API keys

```bash
cp .env.example .env
```

Open `.env` in VS Code and fill in your keys:

```
ANTHROPIC_API_KEY=sk-ant-...        ← https://console.anthropic.com
ALPACA_API_KEY=PK...                ← https://alpaca.markets (free paper account)
ALPACA_SECRET_KEY=...
OANDA_API_KEY=...                   ← https://www.oanda.com (practice account)
OANDA_ACCOUNT_ID=...
ALPHA_VANTAGE_API_KEY=...           ← https://www.alphavantage.co (free)
```

**Only Anthropic is required to start.** The app shows demo data when broker
keys are missing.

### 4. Run the app

You need **two terminal windows** open at the same time.

**Terminal 1 — Backend server:**
```bash
cd alphabot
node server.js
# Output: ✅ AlphaBot server running on http://localhost:3001
```

**Terminal 2 — React frontend:**
```bash
cd alphabot
npm start
# Opens http://localhost:3000 in your browser automatically
```

---

## Getting free API keys

### Anthropic (required for AI features)
1. Go to https://console.anthropic.com
2. Sign up → API Keys → Create Key
3. Copy the `sk-ant-...` key into `.env`

### Alpaca (stocks & options — paper trading is free)
1. Go to https://alpaca.markets → Open Account
2. Log in → API Keys → Generate Key
3. Make sure you're on the **Paper Trading** environment
4. Copy `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` into `.env`

### OANDA (forex — practice account is free)
1. Go to https://www.oanda.com → Open a practice account
2. My Account → Manage API Access → Generate Token
3. Copy your Account ID from the dashboard
4. Add both to `.env`

### Alpha Vantage (news & market data — free tier)
1. Go to https://www.alphavantage.co/support/#api-key
2. Request a free key (instant)
3. Add to `.env`

---

## Making changes in VS Code

All source files are in `src/`. Key files to edit:

| File | What to change |
|---|---|
| `src/components/Signals.js` | Modify the AI prompt for signal generation, add new assets |
| `src/components/Research.js` | Add quick-query shortcuts, change research depth |
| `src/components/Trades.js` | Change order types, add options order logic |
| `src/components/Portfolio.js` | Add new charts, change demo data |
| `src/App.css` | All visual styling |
| `server.js` | Add new broker endpoints |
| `src/services/api.js` | Add new API calls |

After editing a file, the browser auto-refreshes (hot reload).

---

## Switching from paper to live trading

1. In Alpaca: switch your API keys from the Paper environment to Live
2. Change `ALPACA_BASE_URL` in `.env` to `https://api.alpaca.markets`
3. In OANDA: generate keys for your live account instead of practice
4. Change `OANDA_BASE_URL` to `https://api-oanda.com`

⚠️ **Always test thoroughly on paper trading before using real money.**

---

## Common issues

**`npm: command not found`** — Install Node.js from https://nodejs.org

**Port 3000 or 3001 already in use** — Change the port in `.env` (`PORT=3002`)
and update `src/services/api.js` (`const BASE = "http://localhost:3002/api"`)

**CORS error in browser** — Make sure `server.js` is running on port 3001

**`Cannot find module '@anthropic-ai/sdk'`** — Run `npm install` again in the
alphabot folder

**AI responses are demo/mock** — Add your `ANTHROPIC_API_KEY` to `.env` and
restart the server
