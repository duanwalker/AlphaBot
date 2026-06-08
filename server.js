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
import {
  getUserProfile,
  saveUserProfile,
  markOnboardingSkipped,
  markOnboardingCompleted,
  updateActiveStrategies,
} from "./services/userProfileDb.js";
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
  getBrokerForUser,
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
  compressSentimentContext,
  compressSentimentForClaude,
} from "./services/compressionService.js";
import {
  getLatestSnapshot,
  getSnapshotHistory,
  getWatchList,
} from "./services/sentimentDb.js";
import { resolveContext } from "./services/contextResolver.js";
import { getSingleSymbolPrompt, getMarketPrompt } from "./services/systemPrompts.js";
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
try {
  startSentimentScheduler();
} catch (err) {
  console.error('[STARTUP] sentimentScheduler failed to start:', err.message);
  console.error('[STARTUP] Continuing without sentiment scheduler.');
}

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
    const enrichedSentiment = compressSentimentContext(autoSentiment, compressedAutoFundamentals);
    const sentimentReliability = enrichedSentiment
      ? { reliability: enrichedSentiment.reliability, reason: enrichedSentiment.reliabilityReason, weight: enrichedSentiment.reliabilityWeight }
      : null;

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

      sentiment: enrichedSentiment,
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


    const enrichedContext = {};
    enrichedContext.marketCap = compressedAutoFundamentals?.marketCap ?? null;
    enrichedContext.postVolume = autoSentiment?.postVolume ?? 0;

    const existingPos = compressedPositions?.find?.(
      p => p.symbol === resolved.symbol
    ) ?? null;
    enrichedContext.existingPosition = existingPos
      ? {
          qty: existingPos.qty,
          avgCost: existingPos.avgCost,
          marketValue: existingPos.marketValue,
          unrealizedPL: existingPos.unrealizedPL,
        }
      : null;

    enrichedContext.upcomingEarnings =
      compressedAutoFundamentals?.nextEarningsDate ?? null;
    enrichedContext.exDividendDate =
      compressedAutoFundamentals?.exDividendDate ?? null;
    enrichedContext.vixLevel = null;

    enrichedContext.sentiment = compressSentimentForClaude(
      autoSentiment,
      enrichedContext.marketCap
    );

    const systemPrompt = resolved.mode === 'single'
      ? getSingleSymbolPrompt(resolved.symbol, userProfile, enrichedContext)
      : getMarketPrompt(userProfile);

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
        max_tokens: 5000,
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
        if (final.stop_reason !== 'end_turn') {
          console.warn(`[assistant] Stream stopped early: stop_reason=${final.stop_reason}, output_tokens=${final.usage?.output_tokens}`);
        }
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

    let sentimentResults = [];

    if (symbols.length > 0) {
      sentimentResults = await Promise.all(
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

    // ── Wheel strategy opportunity cards ──────────────
    try {
      const profile = await getUserProfile(userId, tenantId);
      const isWheelUser = profile?.activeStrategies?.includes('wheel_strategy');

      if (isWheelUser) {
        sentimentResults.forEach((snap, i) => {
          if (!snap || !snap.symbol) return;

          const ticker = symbols[i];

          if (
            snap.score >= 0.65 &&
            snap.signalStrength === 'high' &&
            (snap.trend === 'rising' || snap.trend === 'stable')
          ) {
            cards.push({
              type:      'opportunity',
              ticker,
              title:     `${ticker} — wheel strategy candidate`,
              body:      `Sentiment ${snap.score.toFixed(2)} with ` +
                         `${snap.signalStrength} signal. ` +
                         `Consider selling a cash-secured ` +
                         `put below current price to collect premium.`,
              action:    `Analyze ${ticker} for a wheel strategy entry — suggest a CSP strike and expiry`,
              timestamp: snap.timestamp,
            });
          }
        });
      }
    } catch (wheelInsightErr) {
      console.warn('[INSIGHTS] wheel card generation failed:', wheelInsightErr.message);
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
    res.json({ content: response.content?.find(b => b.type === 'text')?.text });
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
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const { expiration, type, strikeMin, strikeMax } = req.query;
    const broker = await getBrokerForUser(userId, tenantId);
    const results = await broker.getOptionsChain(symbol, expiration, { type, strikeMin, strikeMax });
    res.json({ results });
  } catch (e) {
    console.error('[OPTIONS] chain error:', e.message);
    res.status(500).json({ error: 'Failed to load options chain' });
  }
});

// GET /api/options/expirations/:symbol
app.get('/api/options/expirations/:symbol', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const symbol = req.params.symbol.toUpperCase();
    const broker = await getBrokerForUser(userId, tenantId);
    const expirations = await broker.getOptionsExpirations(symbol);
    res.json({ expirations });
  } catch (e) {
    console.error('[OPTIONS] expirations error:', e.message);
    res.status(500).json({ error: 'Failed to load expirations' });
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
// User Profile / Onboarding
// ─────────────────────────────────────────────────────────────

// GET /api/profile — check onboarding state on app load
app.get('/api/profile', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const profile = await getUserProfile(userId, tenantId);
    res.json({ profile });
  } catch (err) {
    console.error('[PROFILE] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// POST /api/profile/skip
app.post('/api/profile/skip', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    await markOnboardingSkipped(userId, tenantId);
    res.json({ skipped: true });
  } catch (err) {
    console.error('[PROFILE] skip error:', err.message);
    res.status(500).json({ error: 'Failed to save skip' });
  }
});

// POST /api/profile/analyze — analyze questionnaire answers with Claude, return recommendations without saving
app.post('/api/profile/analyze', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    console.log('[PROFILE] Analyzing questionnaire for:', userId);
    const { questionnaire } = req.body;

    if (!questionnaire) {
      return res.status(400).json({ error: 'Questionnaire answers required' });
    }

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0.3,
      system: `You are a financial strategy advisor for AlphaBot,
an AI-powered trading dashboard. Analyze the user's questionnaire
answers and recommend the most appropriate investment strategies.

Available strategies (recommend by ID):

Income strategies:
  wheel_strategy - Systematic CSP + CC income (intermediate)
  covered_calls - Sell calls on owned shares (beginner)
  cash_secured_puts - Sell puts for income/entry (intermediate)
  iron_condor - Range-bound premium selling (advanced)
  bull_call_spread - Defined risk bullish spread (intermediate)
  bear_put_spread - Defined risk bearish/hedge (intermediate)
  options_spreads - General spread strategies (advanced)

Hedge strategies:
  protective_put - Insurance on owned shares (beginner)
  collar - Cap risk and upside on position (intermediate)

Growth strategies:
  leaps - Long-dated leveraged calls (intermediate)
  straddle_strangle - Volatility plays (advanced)
  growth_investing - Long-term growth stocks (intermediate)

Passive strategies:
  index_dca - Regular index ETF purchases (beginner)
  dividend_income - Dividend stock portfolio (beginner)

Matching rules:
  - Beginner experience → only beginner strategies
  - Intermediate experience → beginner + intermediate
  - Advanced experience → all strategies
  - Short time horizon (<2yr) → income/hedge focus
  - Long time horizon (15yr+) → passive/growth focus
  - Low risk tolerance → passive + protective strategies
  - High risk tolerance → growth + advanced strategies
  - Small portfolio (<$10k) → avoid strategies requiring
    large capital (iron condor, wheel on expensive stocks)

Response format — return ONLY valid JSON, no markdown, no preamble:
{
  "recommendedStrategies": ["strategy_id_1", "strategy_id_2"],
  "riskLevel": <1-5 integer>,
  "primaryGoal": "<one sentence summary>",
  "timeHorizon": "<short summary>",
  "claudeAnalysis": "<2-3 paragraph personalized explanation of why these strategies fit this user, what to watch for, and any important considerations for their situation>",
  "warningFlags": ["<any concerns worth flagging>"]
}`,
      messages: [
        {
          role: 'user',
          content: `Please analyze these questionnaire answers and recommend appropriate investment strategies:

Portfolio size: ${questionnaire.portfolioSize}
Primary goal: ${questionnaire.primaryGoal}
Time horizon: ${questionnaire.timeHorizon}
Risk tolerance: ${questionnaire.riskTolerance}
Time commitment per week: ${questionnaire.timeCommitment}
Account type: ${questionnaire.accountType}
Options experience: ${questionnaire.optionsExperience}`,
        },
      ],
    });

    const raw = completion.content?.find(b => b.type === 'text')?.text || '{}';
    let analysis;
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[PROFILE] Claude response parse error:', parseErr);
      return res.status(500).json({ error: 'Failed to parse strategy analysis' });
    }

    res.json({ analysis });
  } catch (err) {
    console.error('[PROFILE] analyze error:', err.message);
    res.status(500).json({ error: 'Failed to analyze profile' });
  }
});

// POST /api/profile/complete — save completed profile after user reviews analysis
app.post('/api/profile/complete', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { questionnaire, strategyProfile, activeStrategies } = req.body;

    if (!questionnaire || Object.keys(questionnaire).length === 0) {
      return res.status(400).json({ error: 'questionnaire answers are required' });
    }

    if (!strategyProfile?.recommendedStrategies?.length) {
      return res.status(400).json({ error: 'strategyProfile with recommendedStrategies is required' });
    }

    await saveUserProfile(userId, tenantId, {
      onboardingCompleted:   true,
      onboardingSkipped:     false,
      onboardingCompletedAt: new Date().toISOString(),
      questionnaire,
      strategyProfile: {
        ...strategyProfile,
        generatedAt: new Date().toISOString(),
      },
      activeStrategies,
    });

    await markOnboardingCompleted(userId, tenantId);

    res.json({ success: true });
  } catch (err) {
    console.error('[PROFILE] complete error:', err.message);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// PUT /api/profile/strategies — update active strategies without a full profile rewrite
app.put('/api/profile/strategies', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { activeStrategies } = req.body;

    if (!Array.isArray(activeStrategies)) {
      return res.status(400).json({ error: 'activeStrategies must be an array' });
    }

    await updateActiveStrategies(userId, tenantId, activeStrategies);
    res.json({ success: true, activeStrategies });
  } catch (err) {
    console.error('[PROFILE] strategies error:', err.message);
    res.status(500).json({ error: 'Failed to update strategies' });
  }
});

// ─────────────────────────────────────────────────────────────
// Trading Mode Toggle
// ─────────────────────────────────────────────────────────────

app.get('/api/settings/trading-mode', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const profile = await getUserProfile(userId, tenantId);
    const mode = profile?.tradingMode || 'paper';
    res.json({ mode });
  } catch (err) {
    res.json({ mode: 'paper' });
  }
});

app.put('/api/settings/trading-mode', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { mode } = req.body;

    if (!['paper', 'live'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be paper or live' });
    }

    if (mode === 'live') {
      if (!process.env.ALPACA_LIVE_API_KEY || !process.env.ALPACA_LIVE_SECRET_KEY) {
        return res.status(400).json({
          error: 'Live account API keys not configured. Add ALPACA_LIVE_API_KEY and ALPACA_LIVE_SECRET_KEY to .env',
        });
      }
    }

    await saveUserProfile(userId, tenantId, { tradingMode: mode });
    console.log(`[TRADING MODE] ${userId} switched to ${mode}`);
    res.json({ success: true, mode });
  } catch (err) {
    console.error('[TRADING MODE] error:', err.message);
    res.status(500).json({ error: 'Failed to update trading mode' });
  }
});

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Wheel Strategy Helpers
// ─────────────────────────────────────────────────────────────

function compressSentiment(data) {
  if (!data) return null;
  return {
    score:      data.sentimentScore,
    signal:     data.signalStrength,
    trend:      data.trend,
    bullishPct: data.bullishPercent,
    bearishPct: data.bearishPercent,
    postCount:  data.postCount,
    timestamp:  data.timestamp,
  };
}

// ── Wheel Strategy Routes ──────────────────

// Group 1 — Positions

app.get('/api/wheel/positions', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const positions = await getOpenPositions(userId);
    res.json({ positions });
  } catch (err) {
    console.error('[WHEEL] getOpenPositions error:', err.message);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

app.get('/api/wheel/positions/all', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const limit = parseInt(req.query.limit) || 50;
    const positions = await getAllPositions(userId, limit);
    res.json({ positions });
  } catch (err) {
    console.error('[WHEEL] getAllPositions error:', err.message);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

app.post('/api/wheel/positions', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const {
      ticker,
      contractType,
      strike,
      expiry,
      contracts,
      premiumPerContract,
      openPrice,
      brokerId,
      cycleId,
      account,
      notes,
    } = req.body;

    if (!ticker || !contractType || !strike || !expiry || !contracts || premiumPerContract == null) {
      return res.status(400).json({ error: 'ticker, contractType, strike, expiry, contracts, premiumPerContract are required' });
    }

    if (!['CSP', 'CC'].includes(contractType)) {
      return res.status(400).json({ error: 'contractType must be CSP or CC' });
    }

    const totalPremium = premiumPerContract * contracts * 100;
    const resolvedCycleId = cycleId || `cycle_${ticker}_${Date.now()}`;

    const position = await createPosition(userId, {
      ticker,
      contractType,
      strike,
      expiry,
      contracts,
      premiumPerContract,
      totalPremium,
      cycleId: resolvedCycleId,
      openPrice,
      brokerId,
      account,
      notes,
    });

    const month = new Date().toISOString().slice(0, 7);
    await updateMonthlyIncome(userId, month, {
      premiumCollected: totalPremium,
      cyclesOpen: 1,
    });

    res.json({ success: true, position });
  } catch (err) {
    console.error('[WHEEL] createPosition error:', err.message);
    res.status(500).json({ error: 'Failed to create position' });
  }
});

app.put('/api/wheel/positions/:positionId', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { positionId } = req.params;
    const updates = { ...req.body };

    if (updates.status === 'expired') {
      updates.realizedPL = updates.totalPremium;
      updates.closedAt = new Date().toISOString();
    } else if (updates.status === 'closed' && updates.closePremium != null) {
      updates.realizedPL = updates.totalPremium - updates.closePremium;
      updates.closedAt = new Date().toISOString();
    }

    await updatePosition(userId, positionId, updates);
    res.json({ success: true });
  } catch (err) {
    console.error('[WHEEL] updatePosition error:', err.message);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Group 2 — Cycles

app.get('/api/wheel/cycles', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const cycles = await getActiveCycles(userId);
    res.json({ cycles });
  } catch (err) {
    console.error('[WHEEL] getActiveCycles error:', err.message);
    res.status(500).json({ error: 'Failed to get cycles' });
  }
});

app.get('/api/wheel/cycles/all', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const cycles = await getAllCycles(userId);
    res.json({ cycles });
  } catch (err) {
    console.error('[WHEEL] getAllCycles error:', err.message);
    res.status(500).json({ error: 'Failed to get cycles' });
  }
});

// Group 3 — Income

app.get('/api/wheel/income', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const months = parseInt(req.query.months) || 12;
    const income = await getMonthlyIncome(userId, months);
    res.json({ income });
  } catch (err) {
    console.error('[WHEEL] getMonthlyIncome error:', err.message);
    res.status(500).json({ error: 'Failed to get income' });
  }
});

// Group 4 — AI Analysis

app.post('/api/wheel/analyze/:ticker', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const ticker = req.params.ticker.toUpperCase();

    const [fundResult, sentResult, posResult, profileResult, newsResult] = await Promise.allSettled([
      getFundamentals(ticker, userId, tenantId),
      getLatestSnapshot(ticker),
      getOpenPositions(userId),
      getUserProfile(userId, tenantId),
      getMarketNews(ticker, userId, tenantId),
    ]);

    const fundamentals = fundResult.status === 'fulfilled' ? compressFundamentals(fundResult.value) : null;
    const sentiment = sentResult.status === 'fulfilled' ? compressSentiment(sentResult.value) : null;
    const openPositions = posResult.status === 'fulfilled' ? posResult.value : [];
    const userProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;

    const rawNews = newsResult.status === 'fulfilled' ? newsResult.value : null;
    const compressedNews = rawNews?.feed
      ?.slice(0, 5)
      .map(a => ({
        title:     a.title,
        source:    a.source,
        published: a.time_published,
        summary:   a.summary?.slice(0, 300),
        sentiment: a.overall_sentiment_label,
        relevance: a.relevance_score,
      })) || [];

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.3,
      system: `You are AlphaBot, a wheel strategy advisor.
Analyze the provided data and give a specific wheel strategy recommendation for this ticker.
The wheel strategy: sell cash-secured puts (CSP) below current price to collect premium. If assigned, sell covered calls (CC) above cost basis.
Focus on: is this a good wheel candidate, suggested CSP strike and expiry, expected premium and annualized return, key risks, sentiment timing signal.
Be specific with numbers.
Factor in recent news sentiment and any upcoming catalysts (earnings, FDA decisions, macro events) when assessing entry timing risk.`,
      messages: [
        {
          role: 'user',
          content: `Ticker: ${ticker}

Fundamentals:
${JSON.stringify(fundamentals, null, 2)}

Sentiment:
${JSON.stringify(sentiment, null, 2)}

Recent news (${compressedNews.length} articles):
${JSON.stringify(compressedNews, null, 2)}

Open Wheel Positions:
${JSON.stringify(openPositions, null, 2)}

User Strategy Profile:
${JSON.stringify(userProfile?.strategyProfile ?? null, null, 2)}`,
        },
      ],
    });

    const analysis = completion.content.find((b) => b.type === 'text')?.text;
    res.json({ ticker, analysis });
  } catch (err) {
    console.error('[WHEEL] analyze error:', err.message);
    res.status(500).json({ error: 'Failed to analyze ticker' });
  }
});

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
