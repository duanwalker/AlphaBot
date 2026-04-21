// server.js - AlphaBot backend server
// Handles API calls to Anthropic, Alpaca, OANDA, and Alpha Vantage
// Run with: node server.js

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authMiddleware from "./middleware/auth.js";
import searchRoutes from "./routes/search.js";
import { attachEntityScope, attachEntityScopeList } from "./services/entityMetadata.js";
import {
  createAlpacaOrder,
  cancelAlpacaOrder,
  getAlpacaAccount,
  getAlpacaOrders,
  getAlpacaPositions,
  getAlpacaQuote,
  createOandaOrder,
  getOandaAccount,
  getOandaPositions,
  getOandaPrice,
} from "./services/brokerService.js";
import {
  getFundamentals,
  getHistorical,
  getMarketNews,
  getMarketQuote,
  getMarketSnapshot,
} from "./services/marketDataService.js";


dotenv.config();

// ─────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

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
    const { message, context = {} } = req.body;
    const { id: userId, tenantId } = req.user;
    let account = context.account ? attachEntityScope(context.account, req.user) : null;
    let positions = Array.isArray(context.positions)
      ? attachEntityScopeList(context.positions, req.user)
      : null;
    let orders = Array.isArray(context.orders)
      ? attachEntityScopeList(context.orders, req.user)
      : null;
    let marketSnapshot = Array.isArray(context.marketSnapshot)
      ? attachEntityScopeList(context.marketSnapshot, req.user)
      : null;
    let fundamentals = null;
    let history = null;

    if (!account) {
      try {
        account = await getAlpacaAccount(userId, tenantId);
      } catch (err) {
        console.error("Assistant account error:", err.message);
      }
    }

    if (!positions) {
      try {
        positions = await getAlpacaPositions(userId, tenantId);
      } catch (err) {
        console.error("Assistant positions error:", err.message);
      }
    }

    if (!orders) {
      try {
        orders = await getAlpacaOrders(userId, tenantId);
      } catch (err) {
        console.error("Assistant orders error:", err.message);
      }
    }

    if (!marketSnapshot) {
      try {
        marketSnapshot = await getMarketSnapshot(userId, tenantId);
      } catch (err) {
        console.error("Assistant market snapshot error:", err.message);
      }
    }

    const scopedContext = {
      ...context,
      userId,
      tenantId,
      account,
      positions,
      orders,
      marketSnapshot,
    };

    console.log("\n=== /api/assistant context ===");
    console.log(JSON.stringify(scopedContext, null, 2));

    if (context?.symbol) {
      const symbol = context.symbol.toUpperCase();

      try {
        fundamentals = await getFundamentals(symbol, userId, tenantId);
        history = await getHistorical(symbol, "1y", userId, tenantId);

        if (!fundamentals) {
          console.error("Assistant fundamentals: empty response for", symbol);
        }
      } catch (err) {
        console.error("Assistant fundamentals/history error:", err);
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
    ${JSON.stringify(account, null, 2)}

    Positions:
    ${JSON.stringify(positions, null, 2)}

    Orders:
    ${JSON.stringify(orders, null, 2)}

    Market Snapshot:
    ${JSON.stringify({ userId, tenantId, snapshot: marketSnapshot, history }, null, 2)}

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
    const { id: userId } = req.user;
    const { messages, system, max_tokens = 1000 } = req.body;
    console.log("/api/ai/chat user:", userId);
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

app.get("/api/alpaca/account", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getAlpacaAccount(userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/positions", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getAlpacaPositions(userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/orders", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getAlpacaOrders(userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/alpaca/orders", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const order = req.body;
    const data = await createAlpacaOrder(order, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/alpaca/orders/:id", async (req, res) => {
  try {
    const { id: userId } = req.user;
    await cancelAlpacaOrder(req.params.id, userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alpaca/quote/:symbol", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const quote = await getAlpacaQuote(req.params.symbol, userId, tenantId);

    res.json(quote);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// OANDA (Forex)
// ─────────────────────────────────────────────────────────────

app.get("/api/oanda/account", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getOandaAccount(userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/oanda/positions", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getOandaPositions(userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/oanda/orders", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await createOandaOrder(req.body, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/oanda/price/:pair", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getOandaPrice(req.params.pair, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Alpha Vantage (Market Data)
// ─────────────────────────────────────────────────────────────

app.get("/api/fundamentals/:symbol", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const data = await getFundamentals(symbol, userId, tenantId);

    if (!data) {
      return res.status(404).json({ error: "No fundamentals found" });
    }

    res.json(data);
  } catch (e) {
    console.error("Fundamentals error:", e.message);
    res.status(500).json({ error: "Failed to fetch fundamentals" });
  }
});

app.get("/api/history/:symbol", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = String(req.query.timeframe || "1y").toLowerCase();

    const history = await getHistorical(symbol, timeframe, userId, tenantId);
    if (!history) {
      return res.status(404).json({ error: `No historical data found for ${symbol}` });
    }

    res.json(history);
  } catch (e) {
    if (e?.code === "YAHOO_PROXY_API_KEY_MISSING") {
      return res.status(500).json({ error: "Missing YAHOO_PROXY_API_KEY for Yahoo historical data" });
    }

    if (e?.code === "UNSUPPORTED_TIMEFRAME") {
      return res.status(400).json({ error: e.message });
    }

    console.error("Historical data error:", e.message);
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
});

app.get("/api/market/quote/:symbol", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getMarketQuote(req.params.symbol, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/market/news/:symbol", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const data = await getMarketNews(req.params.symbol, userId, tenantId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  const { id: userId, tenantId } = req.user;
  res.json({
    status: "ok",
    auth: {
      userId,
      tenantId,
    },
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
