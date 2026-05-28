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
import userProfileRoutes from "./routes/userProfile.js";
import { getUserProfile } from "./services/userProfileDb.js";
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
import { buildCacheKey, deleteCacheKey } from "./services/cache.js";
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
import { resolveContext } from "./services/contextResolver.js";
import { getSingleSymbolPrompt, getMarketPrompt } from "./services/systemPrompts.js";


dotenv.config();

const PEER_MAP = {
  NVDA: ["AMD", "INTC", "QCOM", "AVGO"],
  MSFT: ["AAPL", "GOOG", "AMZN", "META"],
  AAPL: ["MSFT", "GOOG", "AMZN", "META"],
  AMZN: ["GOOG", "META", "MSFT", "AAPL"],
  TSLA: ["GM", "F", "RIVN", "LCID"],
  // Add more as needed
};

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
app.use("/api/user/profile", userProfileRoutes);

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

    // Resolve context — UI symbol wins, message inference is fallback
    const resolved = resolveContext(context.symbol, message);
    console.log('[CONTEXT]', resolved.mode, '|', resolved.symbol || 'no symbol');

    // Load user strategy profile (non-blocking — absence is fine)
    let userProfile = null;
    try {
      userProfile = await getUserProfile(userId, tenantId);
    } catch (err) {
      console.warn('[ASSISTANT] Could not load user profile:', err.message);
    }

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

    let compressed;
    console.time("[TIMING] context_payload");
    try {
      // Build compressed research-friendly payload
      compressed = {
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
    } finally {
      console.timeEnd("[TIMING] context_payload");
    }

    // Support both frontend formats: { query: "..."} and { message: "..." }
    const query =
      (typeof req.body?.query === "string" && req.body.query.trim().length > 0)
        ? req.body.query
        : (typeof req.body?.message === "string" && req.body.message.trim().length > 0)
            ? req.body.message
            : "";

    // Use resolver output — replaces the old NLP inference block
    const effectiveTicker = resolved.symbol;
    const isMarketMode = resolved.mode === 'market';

    // Auto-fetch fundamentals for effectiveTicker
    let autoFundamentals = null;
    if (effectiveTicker) {
      try {
        autoFundamentals = await getFundamentals(
          effectiveTicker,
          userId,
          tenantId
        );
      } catch (err) {
        console.error("Assistant fundamentals auto-fetch failed:", err);
      }
    }

    const compressedAutoFundamentals = compressFundamentals(autoFundamentals);

    // Auto-fetch sentiment for effectiveTicker
    let autoSentiment = null;

    if (effectiveTicker) {
      try {
        const latestSnapshot = await getLatestSnapshot(effectiveTicker);
        const sentimentHistory = await getSnapshotHistory(effectiveTicker, 30);

        if (latestSnapshot) {
          const trend = {};

          if (sentimentHistory.length >= 3) {
            trend.day3 =
              sentimentHistory[0].sentimentScore -
              sentimentHistory[2].sentimentScore;
          }
          if (sentimentHistory.length >= 7) {
            trend.day7 =
              sentimentHistory[0].sentimentScore -
              sentimentHistory[6].sentimentScore;
          }
          if (sentimentHistory.length >= 30) {
            trend.day30 =
              sentimentHistory[0].sentimentScore -
              sentimentHistory[sentimentHistory.length - 1].sentimentScore;
          }

          trend.direction =
            trend.day7 > 0.1
              ? "up"
              : trend.day7 < -0.1
              ? "down"
              : "flat";

          autoSentiment = {
            latest: {
              score: latestSnapshot.sentimentScore,
              label: latestSnapshot.sentimentLabel,
              timestamp: latestSnapshot.timestamp,
              source: latestSnapshot.source,
            },
            history: sentimentHistory.map((s) => ({
              timestamp: s.timestamp || s.RowKey,
              score: s.sentimentScore,
              label: s.sentimentLabel,
            })),
            trend,
          };
        }
      } catch (err) {
        console.error("Assistant sentiment auto-fetch failed:", err);
      }
    }

    // Auto-fetch sentiment-classified articles
    let autoSentimentArticles = null;

    if (effectiveTicker) {
      try {
        const newsData = await getMarketNews(effectiveTicker, userId, tenantId);

        if (Array.isArray(newsData?.feed) && newsData.feed.length > 0) {
          const articles = newsData.feed.map((article) => ({
            title: article.title || "",
            url: article.url || "",
            source: article.source || "",
            time_published: article.time_published || "",
            summary: article.summary || "",
            overall_sentiment_score: Number(article.overall_sentiment_score ?? 0),
            overall_sentiment_label: article.overall_sentiment_label || "neutral",
            relevance_score: Number(article.relevance_score ?? 0),
            ticker_mentions:
              article.ticker_sentiment?.map((t) => ({
                ticker: t.ticker,
                sentiment_score: t.sentiment_score,
                sentiment_label: t.sentiment_label,
              })) || [],
          }));

          const positive = articles.filter((a) => a.overall_sentiment_score > 0.2);
          const negative = articles.filter((a) => a.overall_sentiment_score < -0.2);
          const neutral = articles.filter(
            (a) =>
              a.overall_sentiment_score >= -0.2 &&
              a.overall_sentiment_score <= 0.2
          );

          autoSentimentArticles = {
            latest: articles.slice(0, 10),
            positive: positive.slice(0, 5),
            negative: negative.slice(0, 5),
            neutral: neutral.slice(0, 5),
            drivers: {
              positive: positive
                .sort(
                  (a, b) =>
                    b.overall_sentiment_score - a.overall_sentiment_score
                )
                .slice(0, 3),
              negative: negative
                .sort(
                  (a, b) =>
                    a.overall_sentiment_score - b.overall_sentiment_score
                )
                .slice(0, 3),
            },
          };
        }
      } catch (err) {
        console.error("Assistant sentiment-articles auto-fetch failed:", err);
      }
    }

    // Auto-fetch price history for effectiveTicker
    let autoHistory = null;

    if (effectiveTicker) {
      try {
        const rawHistory = await getHistorical(
          effectiveTicker,
          "3mo",
          userId,
          tenantId
        );

        if (Array.isArray(rawHistory?.candles) && rawHistory.candles.length > 0) {
          autoHistory = rawHistory.candles.map((h) => ({
            date: h.date,
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.close,
            volume: h.volume,
          }));
        }
      } catch (err) {
        console.error("Assistant history auto-fetch failed:", err);
      }
    }

    // Auto-fetch snapshot for effectiveTicker
    let autoSnapshot = null;

    if (effectiveTicker) {
      try {
        const snap = await getMarketQuote(effectiveTicker, userId, tenantId);

        if (snap) {
          autoSnapshot = [{
            symbol: effectiveTicker,
            bid: snap.bp ?? null,
            ask: snap.ap ?? null,
            last: snap["05. price"] ?? null,
            timestamp: snap["07. latest trading day"] ?? null,
            volume: snap["06. volume"] ?? null,
            change: snap["09. change"] ?? null,
            changePercent: snap["10. change percent"] ?? null,
          }];
        }
      } catch (err) {
        console.error("Assistant snapshot auto-fetch failed:", err);
      }
    }

    // Auto-fetch peers for effectiveTicker
    let autoPeers = [];

    if (effectiveTicker && PEER_MAP[effectiveTicker]) {
      const peerSymbols = PEER_MAP[effectiveTicker];

      for (const peer of peerSymbols) {
        try {
          const peerFund = await getFundamentals(peer, userId, tenantId);
          const peerSnap = await getMarketQuote(peer, userId, tenantId);

          autoPeers.push({
            symbol: peer,
            fundamentals: compressFundamentals(peerFund),
            snapshot: compressSnapshot([
              {
                symbol: peer,
                bid: peerSnap?.bp ?? null,
                ask: peerSnap?.ap ?? null,
                last: peerSnap?.["05. price"] ?? null,
                timestamp: peerSnap?.["07. latest trading day"] ?? null,
                volume: peerSnap?.["06. volume"] ?? null,
                change: peerSnap?.["09. change"] ?? null,
                changePercent: peerSnap?.["10. change percent"] ?? null,
              },
            ]),
          });
        } catch (err) {
          console.error("Assistant peer auto-fetch failed for:", peer, err);
        }
      }
    }

    let marketOverview = null;

    if (isMarketMode) {
      try {
        // Fetch major indexes
        const sp500 = await getMarketQuote("^GSPC", userId, tenantId);
        const nasdaq = await getMarketQuote("^IXIC", userId, tenantId);
        const dow = await getMarketQuote("^DJI", userId, tenantId);

        // Fetch sector performance (MVP: static list of ETFs)
        const SECTOR_ETFS = {
          Technology: "XLK",
          Financials: "XLF",
          Energy: "XLE",
          Industrials: "XLI",
          Healthcare: "XLV",
          ConsumerDiscretionary: "XLY",
          ConsumerStaples: "XLP",
          Utilities: "XLU",
          Materials: "XLB",
          RealEstate: "XLRE",
          Communications: "XLC",
        };

        const sectorData = {};

        for (const [sector, symbol] of Object.entries(SECTOR_ETFS)) {
          try {
            const snap = await getMarketQuote(symbol, userId, tenantId);
            sectorData[sector] = {
              symbol,
              change: snap?.["09. change"] ?? null,
              changePercent: snap?.["10. change percent"] ?? null,
            };
          } catch (err) {
            console.error("Sector fetch failed:", sector, err);
          }
        }

        // Fetch top gainers/losers (MVP: use existing watchlist sentiment)
        const gainers = [];
        const losers = [];

        if (watchlistSentiment?.top_positive) {
          for (const item of watchlistSentiment.top_positive) {
            gainers.push(item);
          }
        }

        if (watchlistSentiment?.top_negative) {
          for (const item of watchlistSentiment.top_negative) {
            losers.push(item);
          }
        }

        marketOverview = {
          indexes: {
            sp500: compressSnapshot([
              {
                symbol: "^GSPC",
                last: sp500?.["05. price"] ?? null,
                change: sp500?.["09. change"] ?? null,
                changePercent: sp500?.["10. change percent"] ?? null,
              },
            ]),
            nasdaq: compressSnapshot([
              {
                symbol: "^IXIC",
                last: nasdaq?.["05. price"] ?? null,
                change: nasdaq?.["09. change"] ?? null,
                changePercent: nasdaq?.["10. change percent"] ?? null,
              },
            ]),
            dow: compressSnapshot([
              {
                symbol: "^DJI",
                last: dow?.["05. price"] ?? null,
                change: dow?.["09. change"] ?? null,
                changePercent: dow?.["10. change percent"] ?? null,
              },
            ]),
          },
          sectors: sectorData,
          gainers,
          losers,
        };
      } catch (err) {
        console.error("Market-mode fetch failed:", err);
      }
    }

    const compressedAutoHistory = compressHistory(autoHistory);
    const compressedAutoSnapshot = compressSnapshot(autoSnapshot);

    let articles = [];
    if (effectiveTicker) {
      try {
        console.log("[NEWS DEBUG] Fetching news for:", effectiveTicker);
        const newsResponse = await fetch(
          `http://localhost:3001/api/market/news/${encodeURIComponent(effectiveTicker)}`
        );
        console.log("[NEWS DEBUG] Raw response status:", newsResponse.status);
        const newsJson = await newsResponse.json();
        console.log("[NEWS DEBUG] Parsed news JSON:", JSON.stringify(newsJson, null, 2));
        if (newsJson?.Information) {
          console.warn("[NEWS RATE LIMIT] Alpha Vantage returned Information:", newsJson.Information);
        }
        if (newsJson?.Note) {
          console.warn("[NEWS RATE LIMIT] Alpha Vantage returned Note:", newsJson.Note);
        }
        if (newsJson?.["Error Message"]) {
          console.warn("[NEWS RATE LIMIT] Alpha Vantage returned Error Message:", newsJson["Error Message"]);
        }
        console.log("[NEWS SUMMARY] feed length:", Array.isArray(newsJson.feed) ? newsJson.feed.length : "no feed array");
        console.log("[NEWS SUMMARY] response keys:", Object.keys(newsJson));
        const rawArticles = newsJson?.articles || (Array.isArray(newsJson?.feed) ? newsJson.feed : []);
        console.log("[NEWS DEBUG] rawArticles length:", rawArticles.length);
        console.log("[NEWS DEBUG] rawArticles sample:", rawArticles.slice(0, 2));

        articles = rawArticles.slice(0, 5);
      } catch (err) {
        console.error("Assistant news fetch failed:", err);
      }
    }

    const compressedArticles = articles.map((a) => ({
      title: a?.title,
      summary: (a?.summary || "").slice(0, 300),
      url: a?.url,
      publishedAt: a?.time_published || a?.publishedAt || null,
      source: a?.source || null,
    }));
    console.log("[NEWS DEBUG] compressedArticles length:", compressedArticles.length);
    console.log("[NEWS DEBUG] compressedArticles sample:", compressedArticles.slice(0, 2));

    const payload = {
      query,
      ticker: effectiveTicker,

      fundamentals: compressedAutoFundamentals,
      history: compressedAutoHistory,
      snapshot: compressedAutoSnapshot,
      peers: autoPeers,
      marketMode: isMarketMode,
      marketOverview,

      sentiment: autoSentiment,
      sentimentArticles: autoSentimentArticles,
      articles: compressedArticles,

      account: compressed.account,
      positions: compressedPositions,
      orders: compressedOrders,

      watchlistSentiment,

      userId,
      tenantId,

      userStrategyProfile: userProfile?.strategyProfile
        ? {
            riskLevel:             userProfile.strategyProfile.riskLevel,
            primaryGoal:           userProfile.strategyProfile.primaryGoal,
            timeHorizon:           userProfile.strategyProfile.timeHorizon,
            recommendedStrategies: userProfile.strategyProfile.recommendedStrategies,
            claudeAnalysis:        userProfile.strategyProfile.claudeAnalysis,
          }
        : null,
    };


    const systemPrompt = resolved.mode === 'single'
      ? getSingleSymbolPrompt(resolved.symbol, userProfile?.strategyProfile)
      : getMarketPrompt(userProfile?.strategyProfile);

    const primaryModel = "claude-haiku-4-5-20251001";
    const fallbackModel = "claude-sonnet-4-6";
    let finalMessage;
    let usedModel = primaryModel;
    console.time("[TIMING] claude_call");
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const streamParams = {
        max_tokens: 1500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: JSON.stringify(payload) }
            ]
          }
        ]
      };

      async function streamWithModel(model) {
        const stream = anthropic.messages.stream({
          model,
          ...streamParams,
        });

        let fullText = "";
        for await (const chunk of stream) {
          const token = chunk?.delta?.text;
          if (token) {
            fullText += token;
            res.write(token);
          }
        }

        const final = await stream.finalMessage();
        console.log("Final message:", final);
        return final;
      }

      let fullText = "";
      console.time("[TIMING] response_send");
      try {
        try {
          finalMessage = await streamWithModel(primaryModel);
        } catch (err) {
          const statusCode = Number(err?.status || err?.statusCode || 0);
          const errorType = String(err?.error?.type || err?.type || "").toLowerCase();
          const canFallback = statusCode === 404 || errorType === "not_found_error";

          if (!canFallback) {
            throw err;
          }

          console.warn(
            `[ASSISTANT] Primary model failed (${primaryModel}). Falling back to ${fallbackModel}. Error:`,
            err?.message || err
          );
          usedModel = fallbackModel;
          finalMessage = await streamWithModel(fallbackModel);
        }
        res.end();
      } finally {
        console.timeEnd("[TIMING] response_send");
      }
    } finally {
      console.timeEnd("[TIMING] claude_call");
    }

    // ─── Usage Metering (B1 Logging Only) ──────────────────────────────
    console.time("[TIMING] usage_metering");
    try {
      const usage = finalMessage?.usage || {};
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
        model: usedModel,
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

  } catch (err) {
    console.error("Assistant error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Assistant failed" });
    } else {
      res.end();
    }
  } finally {
    console.timeEnd("[TIMING] assistant_total");
  }
});

// ─────────────────────────────────────────────────────────────
// Assistant Insights Endpoint
// ─────────────────────────────────────────────────────────────

app.get("/api/assistant/insights", async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;

    const cards = [
      {
        type: "briefing",
        ticker: "MARKET",
        title: "Morning briefing",
        body: "Morning market briefing is enabled. Watchlist sentiment cards will appear when signals are detected.",
        action: "Give me a full market briefing for today",
        timestamp: new Date().toISOString(),
      },
    ];

    const watchlist = await getWatchList(userId).catch(() => []);
    const symbols = Array.isArray(watchlist)
      ? watchlist
          .map((item) => String(item?.ticker || item?.symbol || "").toUpperCase())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // Fetch positions to cross-reference sentiment with held stocks
    let positions = [];
    try {
      positions = await getAlpacaPositions(userId, tenantId);
    } catch { /* positions optional */ }

    if (symbols.length > 0) {
      const sentimentResults = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const snapshot = await getLatestSnapshot(symbol);
            return {
              symbol,
              score: Number(snapshot?.sentimentScore ?? 0),
              label: snapshot?.sentimentLabel || "neutral",
              signalStrength: snapshot?.signalStrength || "low",
              trend: snapshot?.trend || "stable",
              reasoning: snapshot?.reasoning || "",
              timestamp: snapshot?.timestamp || null,
            };
          } catch {
            return { symbol, score: 0, label: "neutral", signalStrength: "low", trend: "stable", reasoning: "" };
          }
        })
      );

      const sorted = sentimentResults.sort((a, b) => b.score - a.score);

      // Opportunity: strong bullish signal — high score + high/moderate signal strength + rising
      const topOpportunity = sorted.find(
        (item) => item.score > 0.15 && item.signalStrength !== "low"
      ) || sorted.find((item) => item.score > 0.15) || null;

      // Risk: declining sentiment on a held position (or just bearish watchlist item)
      const topRisk = [...sorted].reverse().find((item) => item.score < -0.15) || null;

      if (topOpportunity) {
        const strengthNote = topOpportunity.signalStrength === "high"
          ? "Strong signal"
          : topOpportunity.signalStrength === "moderate"
            ? "Moderate signal"
            : "Signal";
        const trendNote = topOpportunity.trend === "rising" ? ", rising trend" : "";

        cards.push({
          type: "opportunity",
          ticker: topOpportunity.symbol,
          title: `${topOpportunity.symbol} — ${strengthNote.toLowerCase()}${trendNote}`,
          body:
            `Sentiment ${topOpportunity.score.toFixed(2)} (${topOpportunity.label}).` +
            (topOpportunity.reasoning ? ` ${topOpportunity.reasoning}` : ""),
          action: `Analyze ${topOpportunity.symbol} for a potential entry given the current sentiment`,
          timestamp: topOpportunity.timestamp || new Date().toISOString(),
        });
      }

      if (topRisk) {
        const held = positions.find(p => p.symbol === topRisk.symbol);
        const heldNote = held
          ? ` Your position: ${parseFloat(held.unrealized_plpc || held.unrealizedPLPercent || 0) >= 0 ? "+" : ""}${(parseFloat(held.unrealized_plpc || held.unrealizedPLPercent || 0) * 100).toFixed(1)}%.`
          : "";
        const trendNote = topRisk.trend === "falling" ? " Trend falling." : "";

        cards.push({
          type: "risk",
          ticker: topRisk.symbol,
          title: `${topRisk.symbol} — bearish signal`,
          body:
            `Sentiment ${topRisk.score.toFixed(2)} (${topRisk.label}).${trendNote}${heldNote}`,
          action: `Should I cut or hold my ${topRisk.symbol} position given the declining sentiment?`,
          timestamp: topRisk.timestamp || new Date().toISOString(),
        });
      }
    }

    res.json({ insights: cards.slice(0, 3) });
  } catch (err) {
    console.error("Assistant insights error:", err);
    res.status(500).json({ error: "Failed to load assistant insights" });
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

app.delete("/api/cache/fundamentals/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = buildCacheKey("fundamentals", [symbol]);
  deleteCacheKey(cacheKey);
  console.log(`[CACHE] Cleared fundamentals cache for ${symbol}`);
  res.json({ cleared: true, symbol });
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
// Options Endpoints
// ─────────────────────────────────────────────────────────────

// GET /api/options/chain/:symbol?expiration=2026-05-16
app.get('/api/options/chain/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const expiration = req.query.expiration;

    const url = expiration
      ? `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}?expiration_date=${expiration}&limit=100`
      : `https://data.alpaca.markets/v1beta1/options/snapshots/${symbol}?limit=100`;

    const r = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      },
    });

    const responseText = await r.text();
    console.log('[OPTIONS] chain status:', r.status);
    if (!r.ok) {
      console.log('[OPTIONS] chain body:', responseText.slice(0, 300));
      return res.json({ snapshots: {}, error: `Alpaca returned ${r.status}` });
    }

    res.json(JSON.parse(responseText));
  } catch (e) {
    console.error('[OPTIONS] chain error:', e.message);
    res.json({ snapshots: {}, error: e.message });
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
        },
      }
    );

    const responseText = await r.text();
    console.log('[OPTIONS] expirations status:', r.status);
    console.log('[OPTIONS] expirations body:', responseText.slice(0, 300));

    if (!r.ok) {
      return res.json({
        expirations: [],
        error: `Alpaca returned ${r.status}`,
        message: 'Options data may not be available on this account',
      });
    }

    const data = JSON.parse(responseText);
    const expirations = [...new Set(
      (data.option_contracts || []).map(c => c.expiration_date)
    )].sort();

    res.json({ expirations });
  } catch (e) {
    console.error('[OPTIONS] expirations error:', e.message);
    res.json({
      expirations: [],
      error: e.message,
      message: 'Options data unavailable',
    });
  }
});

// POST /api/options/orders
app.post('/api/options/orders', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const order = req.body;
    const data = await createAlpacaOrder(order, userId, tenantId);
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
