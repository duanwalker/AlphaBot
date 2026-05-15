// server.js - AlphaBot backend server
// Handles API calls to Anthropic, Alpaca, OANDA, and Alpha Vantage
// Run with: node server.js

import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authMiddleware from "./middleware/auth.js";
import searchRoutes from "./routes/search.js";
import sentimentRoutes from "./routes/sentiment.js";
import { startSentimentScheduler } from "./services/sentimentScheduler.js";
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
import {
  compressFundamentals,
  compressHistory,
  compressPositions,
  compressOrders,
  compressSnapshot,
} from "./services/compressionService.js";
import {
  getLatestSnapshot,
  getSnapshotHistory,
  getWatchList,
} from "./services/sentimentDb.js";


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
app.use("/api/sentiment", sentimentRoutes);

// ─────────────────────────────────────────────────────────────
// Sentiment Scheduler
// ─────────────────────────────────────────────────────────────
startSentimentScheduler();

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
  console.time("[TIMING] assistant_total");
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
    let sentiment = null;
    let sentimentArticles = null;
    let watchlistSentiment = null;

    console.time("[TIMING] fetch_data");
    try {
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

      if (context?.symbol) {
        const symbol = context.symbol.toUpperCase();

        try {
          const latestSnapshot = await getLatestSnapshot(symbol);
          const sentimentHistory = await getSnapshotHistory(symbol, 30);

          if (latestSnapshot) {
            const trend = {};
            if (sentimentHistory.length >= 3) {
              trend.day3 = sentimentHistory[0]?.sentimentScore - sentimentHistory[2]?.sentimentScore;
            }
            if (sentimentHistory.length >= 7) {
              trend.day7 = sentimentHistory[0]?.sentimentScore - sentimentHistory[6]?.sentimentScore;
            }
            if (sentimentHistory.length >= 30) {
              trend.day30 = sentimentHistory[0]?.sentimentScore - sentimentHistory[sentimentHistory.length - 1]?.sentimentScore;
            }
            trend.direction =
              trend.day7 > 0.1
                ? "up"
                : trend.day7 < -0.1
                  ? "down"
                  : "flat";

            sentiment = {
              latest: {
                score: latestSnapshot?.sentimentScore || null,
                label: latestSnapshot?.sentimentLabel || null,
                timestamp: latestSnapshot?.timestamp || null,
                source: latestSnapshot?.source || null,
              },
              history: sentimentHistory.slice(0, 30).map((s) => ({
                timestamp: s?.timestamp || s?.RowKey,
                score: s?.sentimentScore,
                label: s?.sentimentLabel,
              })),
              trend,
            };
          }
        } catch (err) {
          console.error("Assistant sentiment error:", err?.message);
        }
      }

      if (context?.symbol) {
        const symbol = context.symbol.toUpperCase();

        try {
          const newsData = await getMarketNews(symbol, userId, tenantId);

          if (Array.isArray(newsData?.feed) && newsData.feed.length > 0) {
            const articles = newsData.feed.map((article) => ({
              title: article?.title || "",
              url: article?.url || "",
              source: article?.source || "",
              time_published: article?.time_published || "",
              summary: article?.summary || "",
              overall_sentiment_score: Number(article?.overall_sentiment_score ?? 0),
              overall_sentiment_label: article?.overall_sentiment_label || "neutral",
              relevance_score: Number(article?.relevance_score ?? 0),
              ticker_mentions: article?.ticker_sentiment?.map((t) => ({
                ticker: t?.ticker,
                sentiment_score: t?.sentiment_score,
                sentiment_label: t?.sentiment_label,
              })) || [],
            }));

            const positive = articles.filter((a) => a.overall_sentiment_score > 0.2);
            const negative = articles.filter((a) => a.overall_sentiment_score < -0.2);
            const neutral = articles.filter(
              (a) => a.overall_sentiment_score >= -0.2 && a.overall_sentiment_score <= 0.2
            );

            sentimentArticles = {
              latest: articles.slice(0, 10),
              positive: positive.slice(0, 5),
              negative: negative.slice(0, 5),
              neutral: neutral.slice(0, 5),
              drivers: {
                positive: positive.sort((a, b) => b.overall_sentiment_score - a.overall_sentiment_score).slice(0, 3),
                negative: negative.sort((a, b) => a.overall_sentiment_score - b.overall_sentiment_score).slice(0, 3),
              },
            };
          }
        } catch (err) {
          console.error("Assistant news error:", err?.message);
        }
      }

      if (userId) {
        try {
          const watchlist = await getWatchList(userId);
          if (Array.isArray(watchlist) && watchlist.length > 0) {
            const watchlistSymbols = watchlist.map((w) => w?.ticker || w?.symbol).filter(Boolean).slice(0, 10);
            const watchlistData = await Promise.all(
              watchlistSymbols.map(async (sym) => {
                try {
                  const snap = await getLatestSnapshot(sym);
                  return {
                    symbol: sym,
                    score: snap?.sentimentScore || null,
                    label: snap?.sentimentLabel || null,
                  };
                } catch {
                  return { symbol: sym, score: null, label: null };
                }
              })
            );

            const sorted = watchlistData.sort((a, b) => (b.score || 0) - (a.score || 0));
            watchlistSentiment = {
              top_positive: sorted
                .filter((w) => (w.score || 0) > 0.15)
                .slice(0, 5)
                .map((w) => ({ symbol: w.symbol, score: w.score, label: w.label })),
              top_negative: sorted
                .filter((w) => (w.score || 0) < -0.15)
                .slice(0, 5)
                .map((w) => ({ symbol: w.symbol, score: w.score, label: w.label })),
              total_count: watchlist.length,
            };
          }
        } catch (err) {
          console.error("Assistant watchlist sentiment error:", err?.message);
        }
      }
    } finally {
      console.timeEnd("[TIMING] fetch_data");
    }

    // ─── Research Mode (A2) Compression ───────────────────────────
    console.time("[TIMING] compression");
    const compressedPositions = compressPositions(positions);
    const compressedOrders = compressOrders(orders);
    const compressedFundamentals = compressFundamentals(fundamentals);
    const compressedHistory = compressHistory(history);
    const compressedSnapshot = compressSnapshot(marketSnapshot);
    console.timeEnd("[TIMING] compression");

    let userContext;
    console.time("[TIMING] context_payload");
    try {
      // Build compressed research-friendly payload
      const compressed = {
        account: account ? {
          buyingPower: account.buyingPower || null,
          cash: account.cash || null,
          portfolioValue: account.equity || null,
          dayPL: account.dayPL || null,
          dayPLPercent: account.dayPLPercent || null,
        } : null,
        positions: compressedPositions,
        orders: compressedOrders,
        fundamentals: compressedFundamentals,
        history: compressedHistory,
        snapshot: compressedSnapshot,
        sentiment,
        sentimentArticles,
        watchlistSentiment,
        symbol: context.symbol || null,
        userId,
        tenantId,
      };

      console.log("\n=== /api/assistant compressed context (Research Mode A2) ===");
      console.log(JSON.stringify(compressed, null, 2));

      userContext = `
You will receive compressed research data for the symbol in JSON format.

Compressed Account Data:
${JSON.stringify(compressed.account, null, 2)}

Compressed Positions (symbol, qty, avgEntryPrice, currentPrice, unrealizedPL, unrealizedPLPercent):
${JSON.stringify(compressed.positions, null, 2)}

Compressed Orders (symbol, side, qty, status, filledAvgPrice):
${JSON.stringify(compressed.orders, null, 2)}

Compressed Fundamentals (symbol, marketCap, peRatio, pegRatio, eps, revenueTTM, profitMargin, dividendYield, beta, fiftyTwoWeekHigh, fiftyTwoWeekLow, sector, industry):
${JSON.stringify(compressed.fundamentals, null, 2)}

Compressed History (oneYearChangePercent, oneYearVolatility, oneYearHigh, oneYearLow, trendSummary, sparkline):
${JSON.stringify(compressed.history, null, 2)}

Compressed Market Snapshot (symbol, bid, ask, last, timestamp):
${JSON.stringify(compressed.snapshot, null, 2)}

Sentiment Data (latest score, 30-day history, trend direction, watchlist context):
${JSON.stringify(compressed.sentiment, null, 2)}

Sentiment Articles (relevant news, sentiment scores, positive/negative drivers):
${JSON.stringify(compressed.sentimentArticles, null, 2)}

Watchlist Sentiment Context (top positive/negative movers):
${JSON.stringify(compressed.watchlistSentiment, null, 2)}
    `;
    } finally {
      console.timeEnd("[TIMING] context_payload");
    }


    const systemPrompt = `
    You are AlphaBot, an experimental AI trading assistant embedded in a trading dashboard.
    Your purpose is to turn the provided compressed portfolio + market inputs into clear, structured analysis and actionable trade ideas to make the portfolio grow in value.
    
    RESEARCH MODE (A2): You will receive COMPRESSED research data including sentiment, news, and watchlist context.
    Operating assumptions:
    - Initially using Paper-trading / experimental use. The user makes final decisions; you do not place trades.
    - Use ONLY the COMPRESSED information provided. Do NOT assume missing fields—they are intentionally compressed.
    - Do NOT request additional data beyond what's provided.
    - Be decisive when data is sufficient; be transparent when it is not.
    
    SENTIMENT DATA:
    - latest sentiment score and label for the symbol
    - 30-day sentiment history with trend analysis (3-day, 7-day, 30-day deltas)
    - trend direction ("up", "down", "flat") based on 7-day change
    
    SENTIMENT ARTICLES:
    - relevant news articles with sentiment scores (-1.0 to +1.0)
    - articles grouped by sentiment: positive (>0.2), negative (<-0.2), neutral
    - positive and negative catalyst drivers (top 3 each)
    - ticker mentions and sentiment labels per article
    
    WATCHLIST SENTIMENT:
    - top positive sentiment movers in your watchlist
    - top negative sentiment movers in your watchlist
    - total watchlist count
    
    Core tasks:
    1) Explain market concepts, mechanics, and strategies (stocks + options).
    2) Analyze current positions using compressed data (compressed fundamentals, compressed history, compressed positions, compressed orders, compressed snapshot).
    3) Use sentiment data to detect narrative trends and identify catalysts driving price movements.
    4) Cross-reference sentiment articles with price action to spot divergences or confirmations.
    5) Propose trade candidates that fit portfolio constraints and user's stated goals.
    6) Provide clear rationale, risk analysis, and explicit invalidation criteria.
    
    SENTIMENT ANALYSIS INSTRUCTIONS:
    - Use sentiment score to assess market narrative and retail/professional bias
    - Identify positive catalysts in sentiment articles (news drivers that explain rallies)
    - Identify negative catalysts in sentiment articles (risks or concerns driving declines)
    - Detect divergences: strong sentiment but weak price action, or vice versa
    - Monitor sentiment trends: increasing positive sentiment may signal sustained demand
    - Note sentiment reversals: sudden negative articles after positive trends suggest inflection points
    
    When you make recommendations:
    - Provide reasoning in a compact, checkable way.
    - Include at least one alternative path.
    - Tie every suggestion to available buying power, position sizing, and risk controls.
    - Reference only the compressed fields provided (do not invent missing fields).
    - Integrate sentiment and news findings into your rationale
    Output requirements:
    A) Snapshot (current state analysis)
    B) Primary idea (best opportunity)
    C) Secondary ideas (2-3 alternatives)
    D) Questions needed (if data gaps exist)
    `;

    let completion;
    console.time("[TIMING] claude_call");
    try {
      completion = await anthropic.messages.create({
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
    } finally {
      console.timeEnd("[TIMING] claude_call");
    }

    const reply = completion.content?.[0]?.text || "No response generated.";

    // ─── Usage Metering (B1 Logging Only) ──────────────────────────────
    console.time("[TIMING] usage_metering");
    try {
      const usage = completion?.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Anthropic Sonnet 3.5 pricing (as of April 2026)
      const inputCostPerToken = 0.000003;  // $3 per million input tokens
      const outputCostPerToken = 0.000015; // $15 per million output tokens
      const cost = (inputTokens * inputCostPerToken) + (outputTokens * outputCostPerToken);

      const usageEvent = {
        timestamp: new Date().toISOString(),
        userId,
        model: "claude-sonnet-4-6",
        symbol: context.symbol || null,
        inputTokens,
        outputTokens,
        totalTokens,
        costUSD: Number(cost.toFixed(6)),
      };

      console.log("[USAGE]", JSON.stringify(usageEvent, null, 2));
    } finally {
      console.timeEnd("[TIMING] usage_metering");
    }

    console.time("[TIMING] response_send");
    try {
      res.json({ reply });
    } finally {
      console.timeEnd("[TIMING] response_send");
    }

  } catch (err) {
    console.error("Assistant error:", err);
    res.status(500).json({ error: "Assistant failed" });
  } finally {
    console.timeEnd("[TIMING] assistant_total");
  }
});

// ─────────────────────────────────────────────────────────────
// Legacy Anthropic Chat Route
// ─────────────────────────────────────────────────────────────

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { messages, system, max_tokens = 1000 } = req.body;
    res.set("Deprecation", "true");
    console.warn("[DEPRECATED] /api/ai/chat invoked using claude-sonnet-4-6");
    console.log("[LEGACY] /api/ai/chat invoked", { userId, model: "claude-sonnet-4-6" });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
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

// Usage logs stub (B1 Logging Only)
app.get("/api/usage/logs", (req, res) => {
  res.json({
    summary: {
      totalTokens: 12345,
      totalCost: 0.42,
      totalRequests: 18,
    },
    events: [
      {
        timestamp: "2026-04-21T23:01:12Z",
        symbol: "HIMX",
        inputTokens: 812,
        outputTokens: 412,
        totalTokens: 1224,
        cost: 0.00312,
      },
    ],
  });
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
