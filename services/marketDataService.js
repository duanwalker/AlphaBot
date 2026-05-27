import axios from "axios";
import {
  buildCacheKey,
  FUNDAMENTALS_TTL,
  HISTORICAL_TTL,
  MARKET_SNAPSHOT_TTL,
  NEWS_TTL,
  QUOTE_TTL,
  getCache,
  getOrSetCache,
  setCache,
} from "./cache.js";
import { attachEntityScope, attachEntityScopeList } from "./entityMetadata.js";
import { normalizePriceData } from "./normalizePriceData.js";
import { fetchYahooHistorical } from "./yahooHistorical.js";
import { normalizeHistoricalData } from "./normalizeHistoricalData.js";

const DEFAULT_MARKET_SNAPSHOT_SYMBOLS = ["AAPL", "MSFT", "AMZN", "NVDA", "INTC"];

async function fetchSharedAlpacaQuote(symbol) {
  const normalizedSymbol = symbol.toUpperCase();
  const response = await fetch(
    `https://data.alpaca.markets/v2/stocks/${normalizedSymbol}/quotes/latest`,
    {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Alpaca ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const latestQuote = data.quote || data;

  return {
    symbol: normalizedSymbol,
    ap: latestQuote.ap || latestQuote.ask_price || null,
    bp: latestQuote.bp || latestQuote.bid_price || null,
    ask: latestQuote.ap || latestQuote.ask_price || null,
    bid: latestQuote.bp || latestQuote.bid_price || null,
    timestamp: latestQuote.t || latestQuote.timestamp || null,
  };
}

export async function getFundamentals(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("fundamentals", [normalizedSymbol]);

  const cached = await getOrSetCache(cacheKey, FUNDAMENTALS_TTL, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${normalizedSymbol}&apikey=${key}`;
    const response = await axios.get(url);
    const data = response.data;

    // Alpha Vantage returns a Note field when rate-limited, or an Error Message
    // for invalid symbols/API keys. Returning null here prevents these bad
    // responses from being stored in the 24-hour cache.
    if (
      !data ||
      Object.keys(data).length === 0 ||
      data.Note ||
      data['Error Message'] ||
      data['Information']
    ) {
      console.warn(`[Fundamentals] Alpha Vantage non-data response for ${normalizedSymbol}:`, Object.keys(data || {}));
      return null;
    }

    const normalized = await normalizePriceData(normalizedSymbol, userId);

    return {
      symbol: normalizedSymbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      marketCap: data.MarketCapitalization,
      peRatio: data.PERatio,
      pegRatio: data.PEGRatio,
      eps: data.EPS,
      dividendYield: data.DividendYield,
      profitMargin: data.ProfitMargin,
      analystTargetPrice: data.AnalystTargetPrice,
      revenueTTM: data.RevenueTTM,
      week52High: normalized.normalized52WeekHigh,
      week52Low: normalized.normalized52WeekLow,
      normalized52WeekHigh: normalized.normalized52WeekHigh,
      normalized52WeekLow: normalized.normalized52WeekLow,
      normalized52WeekSource: normalized.normalized52WeekSource,
      beta: data.Beta,
    };
  });

  return cached ? attachEntityScope(cached, userId, tenantId) : null;
}

export async function getHistorical(symbol, timeframe = "1y", userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const normalizedTimeframe = String(timeframe || "1y").toLowerCase();
  const cacheKey = buildCacheKey("history", [normalizedSymbol, normalizedTimeframe]);

  const cached = await getOrSetCache(cacheKey, HISTORICAL_TTL, async () => {
    const raw = await fetchYahooHistorical(normalizedSymbol, normalizedTimeframe, userId);
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      return null;
    }

    const candles = normalizeHistoricalData(raw);
    if (candles.length === 0) {
      return null;
    }

    return {
      symbol: normalizedSymbol,
      timeframe: normalizedTimeframe,
      candles,
      source: "yahoo_historical",
    };
  });

  return cached ? attachEntityScope(cached, userId, tenantId) : null;
}

export async function getMarketQuote(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("quote", [normalizedSymbol]);

  const cached = await getOrSetCache(cacheKey, QUOTE_TTL, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${normalizedSymbol}&apikey=${key}`
    );
    const data = await response.json();
    return data["Global Quote"] || {};
  });

  return attachEntityScope(cached, userId, tenantId);
}

export async function getMarketNews(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("news", [normalizedSymbol]);

  const cachedValue = getCache(cacheKey);
  const cacheHit = cachedValue !== null;
  const cachedFeed = Array.isArray(cachedValue?.feed)
    ? cachedValue.feed
    : (Array.isArray(cachedValue) ? cachedValue : []);

  console.log("[NEWS] Cache hit:", cacheHit);
  console.log("[NEWS] Cached feed length:", cachedFeed.length);

  if (cacheHit && cachedFeed.length > 0) {
    return {
      ...cachedValue,
      feed: attachEntityScopeList(cachedFeed, userId, tenantId),
      cacheHit: true,
    };
  }

  if (cacheHit && cachedFeed.length === 0) {
    console.log("[NEWS] Cached feed was empty. Bypassing cache and re-fetching once.");
  }

  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const url =
    `https://www.alphavantage.co/query` +
    `?function=NEWS_SENTIMENT` +
    `&tickers=${encodeURIComponent(normalizedSymbol)}` +
    `&limit=10` +
    `&apikey=${encodeURIComponent(key || "")}`;

  console.log("[NEWS] Fetching Alpha Vantage NEWS_SENTIMENT for:", normalizedSymbol);
  console.log("[NEWS] URL:", url);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("[NEWS] Network error while fetching Alpha Vantage news:", error?.message || error);
    return {
      symbol: normalizedSymbol,
      error: "Failed to reach Alpha Vantage",
      details: { message: error?.message || String(error) },
      feed: [],
      cacheHit: false,
    };
  }

  const rawText = await response.text();
  console.log("[NEWS] Raw response:", rawText);

  let rawResponse;
  try {
    rawResponse = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    console.error("[NEWS] Failed to parse Alpha Vantage response:", error?.message || error);
    return {
      symbol: normalizedSymbol,
      error: "Invalid Alpha Vantage response",
      details: { raw: rawText },
      feed: [],
      cacheHit: false,
    };
  }

  const responseKeys = rawResponse && typeof rawResponse === "object"
    ? Object.keys(rawResponse)
    : [];

  console.log("[NEWS] Raw response keys:", responseKeys);
  console.log("[NEWS] Contains feed:", Array.isArray(rawResponse?.feed));
  console.log("[NEWS] Contains items:", rawResponse?.items);
  console.log("[NEWS] Contains Information:", rawResponse?.Information);
  console.log("[NEWS] Contains Note:", rawResponse?.Note);
  console.log("[NEWS] Contains Error Message:", rawResponse?.["Error Message"]);

  if (rawResponse?.Information) {
    console.error("[NEWS] Alpha Vantage Information response:", rawResponse.Information);
    return {
      symbol: normalizedSymbol,
      error: "Alpha Vantage informational response",
      details: rawResponse,
      feed: [],
      cacheHit: false,
    };
  }

  if (rawResponse?.Note) {
    console.error("[NEWS] Alpha Vantage rate limit note:", rawResponse.Note);
    return {
      symbol: normalizedSymbol,
      error: "Alpha Vantage rate limit hit",
      details: rawResponse,
      feed: [],
      cacheHit: false,
    };
  }

  if (rawResponse?.["Error Message"]) {
    console.error("[NEWS] Alpha Vantage error message:", rawResponse["Error Message"]);
    return {
      symbol: normalizedSymbol,
      error: "Alpha Vantage error",
      details: rawResponse,
      feed: [],
      cacheHit: false,
    };
  }

  const parsedFeed = Array.isArray(rawResponse?.feed)
    ? rawResponse.feed
        .filter((article) => article && article.title && article.url && article.time_published)
        .sort((a, b) => new Date(b.time_published) - new Date(a.time_published))
    : [];

  console.log("[NEWS] Parsed feed length:", parsedFeed.length);

  const result = {
    symbol: normalizedSymbol,
    items: rawResponse?.items ?? parsedFeed.length,
    feed: parsedFeed,
    cacheHit: false,
  };

  setCache(cacheKey, result, NEWS_TTL);

  return {
    ...result,
    feed: attachEntityScopeList(parsedFeed, userId, tenantId),
  };
}

export async function getMarketSnapshot(userId, tenantId = "alpha-dev") {
  const cacheKey = buildCacheKey("snapshot", [DEFAULT_MARKET_SNAPSHOT_SYMBOLS.join(",")]);

  const cached = await getOrSetCache(cacheKey, MARKET_SNAPSHOT_TTL, async () => {
    const quotes = await Promise.all(
      DEFAULT_MARKET_SNAPSHOT_SYMBOLS.map((symbol) => fetchSharedAlpacaQuote(symbol))
    );
    return quotes;
  });

  return attachEntityScopeList(cached, userId, tenantId);
}