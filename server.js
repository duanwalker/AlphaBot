// server.js - AlphaBot backend server
// Handles API calls to Anthropic, Alpaca, OANDA, and Alpha Vantage
// Run with: node server.js

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import searchRoutes from "./routes/search.js";
import axios from "axios";


dotenv.config();

// ─────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Search route
app.use("/api/search", searchRoutes);

// ─────────────────────────────────────────────────────────────
// Anthropic Client
// ─────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─────────────────────────────────────────────────────────────
// AI Assistant Endpoint
// ─────────────────────────────────────────────────────────────

app.post("/api/assistant", async (req, res) => {
  try {
    const { message, context } = req.body;
    console.log("\n=== /api/assistant context ===");
    console.log(JSON.stringify(context, null, 2));

   // Optional fundamentals injection (direct Alpha Vantage call)
let fundamentals = null;

if (context?.symbol) {
  try {
    const symbol = context.symbol.toUpperCase();
    const raw = await getFundamentals(symbol);

    if (raw && Object.keys(raw).length > 0) {
      fundamentals = {
        symbol,
        name: raw.Name,
        description: raw.Description,
        marketCap: raw.MarketCapitalization,
        peRatio: raw.PERatio,
        eps: raw.EPS,
        dividendYield: raw.DividendYield,
        profitMargin: raw.ProfitMargin,
        analystTargetPrice: raw.AnalystTargetPrice,
        week52High: raw["52WeekHigh"],
        week52Low: raw["52WeekLow"],
        beta: raw.Beta,
      };
    } else {
      console.error("Assistant fundamentals: empty response for", symbol);
    }
  } catch (err) {
    console.error("Assistant fundamentals error:", err);
  }
}


    const systemPrompt = `
    You are AlphaBot, an experimental AI trading assistant embedded in a trading dashboard.
    Your purpose is to turn the provided portfolio + market inputs into clear, structured analysis and actionable trade ideas to make the portfolio grow in value.
    Operating assumptions:
    - Initially using Paper-trading / experimental use. The user makes final decisions; you do not place trades.
    - Use ONLY the information provided in the conversation/dashboard inputs. If critical data is missing, do not fabricate it—state what’s missing and proceed using explicit assumptions or request the missing inputs.
    - Be decisive when data is sufficient; be transparent when it is not.
    Core tasks:
    1) Explain market concepts, mechanics, and strategies (stocks + options).
    2) Analyze current positions, open orders, watchlist names, and market data supplied by the user.
    3) Propose trade candidates that fit the portfolio constraints and the user’s stated goals.
    4) Provide a clear rationale, risk analysis, and explicit invalidation criteria for each idea.
    When you make recommendations:
    - Provide your reasoning in a compact, checkable way.
    - Include at least one alternative path.
    - Tie every suggestion to available buying power, position sizing, and risk controls.
    Output requirements:
    A) Snapshot
    B) Primary idea
    C) Secondary ideas
    D) Questions needed
    `;

    const userContext = `
    Account:
    ${JSON.stringify(context.account, null, 2)}

    Positions:
    ${JSON.stringify(context.positions, null, 2)}

    Orders:
    ${JSON.stringify(context.orders, null, 2)}

    Market Snapshot:
    ${JSON.stringify(context.marketSnapshot, null, 2)}

    Fundamentals:
    ${fundamentals ? JSON.stringify(fundamentals, null, 2) : "None"}
    `;

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userContext },
            { type: "text", text: `User message: ${message}` }
          ]
        }
      ]
    });

    const reply = completion.content?.[0]?.text || "No response generated.";
    res.json({ reply });

  } catch (err) {
    console.error("Assistant error:", err);
    res.status(500).json({ error: "Assistant failed" });
  }
});

// ─────────────────────────────────────────────────────────────
// Legacy Anthropic Chat Route
// ─────────────────────────────────────────────────────────────

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages, system, max_tokens = 1000 } = req.body;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens,
      system,
      messages,
    });
    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error("Anthropic error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Alpaca (Stocks & Options)
// ─────────────────────────────────────────────────────────────

const alpacaHeaders = () => ({
  "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
  "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
  "Content-Type": "application/json",
});

async function alpacaFetch(path, options = {}) {
  const base = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  const r = await fetch(`${base}${path}`, {
    headers: alpacaHeaders(),
    ...options,
  });
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  return r.json();
}

app.get("/api/alpaca/account", async (req, res) => {
  try {
    const data = await alpacaFetch("/v2/account");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/positions", async (req, res) => {
  try {
    const data = await alpacaFetch("/v2/positions");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/orders", async (req, res) => {
  try {
    const data = await alpacaFetch("/v2/orders?status=all&limit=50");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/alpaca/orders", async (req, res) => {
  try {
    const order = req.body;
    const data = await alpacaFetch("/v2/orders", {
      method: "POST",
      body: JSON.stringify(order),
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/alpaca/orders/:id", async (req, res) => {
  try {
    await alpacaFetch(`/v2/orders/${req.params.id}`, { method: "DELETE" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/quote/:symbol", async (req, res) => {
  try {
    const r = await fetch(
      `https://data.alpaca.markets/v2/stocks/${req.params.symbol}/quotes/latest`,
      { headers: alpacaHeaders() }
    );
    const data = await r.json();
    const quote = data.quote || data;

    res.json({
      ap: quote.ap || quote.ask_price || null,
      bp: quote.bp || quote.bid_price || null,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// OANDA (Forex)
// ─────────────────────────────────────────────────────────────

const oandaHeaders = () => ({
  Authorization: `Bearer ${process.env.OANDA_API_KEY}`,
  "Content-Type": "application/json",
});

async function oandaFetch(path, options = {}) {
  const base = process.env.OANDA_BASE_URL || "https://api-fxpractice.oanda.com";
  const r = await fetch(`${base}${path}`, {
    headers: oandaHeaders(),
    ...options,
  });
  if (!r.ok) throw new Error(`OANDA ${r.status}: ${await r.text()}`);
  return r.json();
}

app.get("/api/oanda/account", async (req, res) => {
  try {
    const id = process.env.OANDA_ACCOUNT_ID;
    const data = await oandaFetch(`/v3/accounts/${id}/summary`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/oanda/positions", async (req, res) => {
  try {
    const id = process.env.OANDA_ACCOUNT_ID;
    const data = await oandaFetch(`/v3/accounts/${id}/openPositions`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/oanda/orders", async (req, res) => {
  try {
    const id = process.env.OANDA_ACCOUNT_ID;
    const data = await oandaFetch(`/v3/accounts/${id}/orders`, {
      method: "POST",
      body: JSON.stringify({ order: req.body }),
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/oanda/price/:pair", async (req, res) => {
  try {
    const instrument = req.params.pair.replace("/", "_");
    const data = await oandaFetch(
      `/v3/instruments/${instrument}/candles?count=1&granularity=S5&price=M`
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Alpha Vantage (Market Data)
// ─────────────────────────────────────────────────────────────

// Alpha Vantage Fundamentals Client
async function getFundamentals(symbol) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${key}`;
  const response = await axios.get(url);
  return response.data;
}

app.get("/api/fundamentals/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await getFundamentals(symbol);

    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({ error: "No fundamentals found" });
    }

    res.json({
      symbol,
      name: data.Name,
      description: data.Description,
      marketCap: data.MarketCapitalization,
      peRatio: data.PERatio,
      eps: data.EPS,
      dividendYield: data.DividendYield,
      profitMargin: data.ProfitMargin,
      analystTargetPrice: data.AnalystTargetPrice,
      week52High: data["52WeekHigh"],
      week52Low: data["52WeekLow"],
      beta: data.Beta
    });
  } catch (e) {
    console.error("Fundamentals error:", e.message);
    res.status(500).json({ error: "Failed to fetch fundamentals" });
  }
});

app.get("/api/market/quote/:symbol", async (req, res) => {
  try {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const r = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${req.params.symbol}&apikey=${key}`
    );
    const data = await r.json();
    res.json(data["Global Quote"] || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/market/news/:symbol", async (req, res) => {
  try {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const r = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${req.params.symbol}&limit=10&apikey=${key}`
    );
    const data = await r.json();
    res.json(data.feed || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    configured: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      alpaca: !!process.env.ALPACA_API_KEY,
      oanda: !!process.env.OANDA_API_KEY,
      alphaVantage: !!process.env.ALPHA_VANTAGE_API_KEY,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅ AlphaBot server running on http://localhost:${PORT}`);
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? "✓" : "✗ missing"}`);
  console.log(`   Alpaca:    ${process.env.ALPACA_API_KEY ? "✓" : "✗ missing"}`);
  console.log(`   OANDA:     ${process.env.OANDA_API_KEY ? "✓" : "✗ missing"}`);
  console.log(`   Alpha Vantage: ${process.env.ALPHA_VANTAGE_API_KEY ? "✓" : "✗ missing"}\n`);
});
