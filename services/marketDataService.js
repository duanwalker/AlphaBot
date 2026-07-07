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
  deleteCacheKey,
} from "./cache.js";
import { attachEntityScope, attachEntityScopeList } from "./entityMetadata.js";
import { normalizePriceData } from "./normalizePriceData.js";
import { fetchYahooHistorical } from "./yahooHistorical.js";
import { normalizeHistoricalData } from "./normalizeHistoricalData.js";
import { AlpacaAdapter } from "../brokers/AlpacaAdapter.js";

const sharedAdapter = new AlpacaAdapter();

const DEFAULT_MARKET_SNAPSHOT_SYMBOLS = ["AAPL", "MSFT", "AMZN", "NVDA", "INTC"];

async function fetchSharedAlpacaQuote(symbol) {
  return sharedAdapter.getQuote(symbol, "shared");
}

export async function getFundamentals(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("fundamentals", [normalizedSymbol]);

  // Evict stale entries that contain only Yahoo 52-week data (no Polygon fields)
  const existing = getCache(cacheKey);
  if (existing && !existing.peRatio && !existing.name) {
    console.warn(`[FUNDAMENTALS] Stale cache entry for ${normalizedSymbol} — clearing and re-fetching`);
    deleteCacheKey(cacheKey);
  }

  const cached = await getOrSetCache(cacheKey, FUNDAMENTALS_TTL, async () => {
    const polygonKey = process.env.POLYGON_API_KEY;

    if (!polygonKey) {
      console.warn('[FUNDAMENTALS] POLYGON_API_KEY not set');
      return null;
    }

    // Fetch ticker details (name, description, exchange)
    const detailsUrl =
      `https://api.polygon.io/v3/reference/tickers/${normalizedSymbol}?apiKey=${polygonKey}`;

    let details = {};
    try {
      const dr = await axios.get(detailsUrl);
      details = dr.data?.results || {};

      if (dr.data?.status === 'ERROR' || dr.data?.error) {
        console.warn('[FUNDAMENTALS] Polygon error:', dr.data?.error);
        return null;
      }
    } catch (err) {
      console.error('[FUNDAMENTALS] Polygon details error:', err.message);
      return null;
    }

    const assetType = details.type || 'CS';
    const isETF = assetType === 'ETF' || assetType === 'ETV' || assetType === 'ETN';

    if (isETF) {
      const normalized = await normalizePriceData(normalizedSymbol, userId).catch(() => ({
        normalized52WeekHigh: null,
        normalized52WeekLow: null,
        normalized52WeekSource: null,
      }));

      return {
        symbol: normalizedSymbol,
        name: details.name || null,
        description: details.description || null,
        assetType: 'ETF',
        sector: 'ETF / Fund',
        industry: details.sic_description || 'Index Fund',
        marketCap: details.market_cap || null,
        peRatio: null,
        eps: null,
        dividendYield: null,
        profitMargin: null,
        beta: null,
        week52High: normalized.normalized52WeekHigh,
        week52Low: normalized.normalized52WeekLow,
        normalized52WeekHigh: normalized.normalized52WeekHigh,
        normalized52WeekLow: normalized.normalized52WeekLow,
        normalized52WeekSource: normalized.normalized52WeekSource,
      };
    }

    // Fetch financials (EPS, revenue etc)
    const financialsUrl =
      `https://api.polygon.io/vX/reference/financials` +
      `?ticker=${normalizedSymbol}&limit=1&apiKey=${polygonKey}`;

    let financials = {};
    try {
      const fr = await axios.get(financialsUrl);
      const results = fr.data?.results?.[0] || {};
      const income = results.financials?.income_statement || {};

      financials = {
        eps: income.basic_earnings_per_share?.value,
        revenue: income.revenues?.value,
        netIncome: income.net_income_loss?.value,
      };
    } catch (err) {
      // Financials optional — don't fail if unavailable
      console.warn('[FUNDAMENTALS] Polygon financials unavailable for', normalizedSymbol);
    }

    // Calculate P/E from EPS + current price (Alpaca primary, AV GLOBAL_QUOTE fallback)
    let peRatio = null;
    const epsVal = financials.eps != null ? parseFloat(financials.eps) : NaN;
    if (!isNaN(epsVal) && epsVal !== 0) {
      let price = null;

      // Primary: Alpaca latest quote (may be null outside market hours)
      try {
        const quoteData = await sharedAdapter.getQuote(normalizedSymbol, userId);
        const raw = quoteData?.ap ?? quoteData?.bp ?? null;
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) price = parsed;
      } catch (err) {
        console.warn('[FUNDAMENTALS] Alpaca price fetch failed:', err.message);
      }

      // Fallback: Alpha Vantage GLOBAL_QUOTE (works outside market hours)
      if (!price) {
        try {
          const avKey = process.env.ALPHA_VANTAGE_API_KEY;
          const avRes = await axios.get(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE` +
            `&symbol=${normalizedSymbol}&apikey=${avKey}`
          );
          const avPrice = parseFloat(avRes.data?.['Global Quote']?.['05. price']);
          if (!isNaN(avPrice) && avPrice > 0) price = avPrice;
        } catch (err) {
          console.warn('[FUNDAMENTALS] AV price fallback failed:', err.message);
        }
      }

      if (price) {
        peRatio = (price / epsVal).toFixed(2);
      }
    }

    // Get 52W high/low from existing Yahoo service
    let normalized = {
      normalized52WeekHigh: null,
      normalized52WeekLow: null,
      normalized52WeekSource: null,
    };
    try {
      normalized = await normalizePriceData(normalizedSymbol, userId);
    } catch (err) {
      console.warn('[FUNDAMENTALS] 52W normalization failed:', err.message);
    }

    const polygonResult = {
      symbol:             normalizedSymbol,
      name:               details.name || null,
      description:        details.description || null,
      assetType:          assetType,
      sector:             details.sic_description || null,
      industry:           details.sic_description || null,
      marketCap:          details.market_cap || null,
      peRatio:            peRatio,
      eps:                financials.eps || null,
      dividendYield:      null,
      exDividendDate:     null,
      profitMargin:       null,
      analystTargetPrice: null,
      revenueTTM:         financials.revenue || null,
      beta:               null, // not in Polygon free tier
      week52High:         normalized.normalized52WeekHigh,
      week52Low:          normalized.normalized52WeekLow,
      normalized52WeekHigh:   normalized.normalized52WeekHigh,
      normalized52WeekLow:    normalized.normalized52WeekLow,
      normalized52WeekSource: normalized.normalized52WeekSource,
    };

    const isMissingCriticalData =
      !polygonResult.name ||
      (!polygonResult.marketCap && !polygonResult.eps);

    if (isMissingCriticalData) {
      console.log('[FUNDAMENTALS] Polygon incomplete for', normalizedSymbol, '— trying Alpha Vantage fallback');

      try {
        const avKey = process.env.ALPHA_VANTAGE_API_KEY;
        const avUrl = `https://www.alphavantage.co/query` +
          `?function=OVERVIEW&symbol=${normalizedSymbol}` +
          `&apikey=${avKey}`;
        const avRes = await axios.get(avUrl);
        const avData = avRes.data;

        if (avData?.Note || avData?.Information || avData?.['Error Message'] || !avData?.Symbol) {
          console.warn('[FUNDAMENTALS] AV fallback also failed for', normalizedSymbol);
          return polygonResult.name ? polygonResult : null;
        }

        console.log('[FUNDAMENTALS] AV fallback succeeded for', normalizedSymbol);

        const avNormalized = await normalizePriceData(normalizedSymbol, userId).catch(() => ({
          normalized52WeekHigh: null,
          normalized52WeekLow: null,
          normalized52WeekSource: null,
        }));

        return {
          symbol: normalizedSymbol,
          name: avData.Name || null,
          description: avData.Description || null,
          assetType: assetType,
          sector: avData.Sector || null,
          industry: avData.Industry || null,
          marketCap: avData.MarketCapitalization || null,
          peRatio: avData.PERatio || null,
          pegRatio: avData.PEGRatio || null,
          eps: avData.EPS || null,
          dividendYield: avData.DividendYield || null,
          exDividendDate: avData.ExDividendDate || null,
          profitMargin: avData.ProfitMargin || null,
          analystTargetPrice: avData.AnalystTargetPrice || null,
          revenueTTM: avData.RevenueTTM || null,
          beta: avData.Beta || null,
          week52High: avNormalized.normalized52WeekHigh,
          week52Low: avNormalized.normalized52WeekLow,
          normalized52WeekHigh: avNormalized.normalized52WeekHigh,
          normalized52WeekLow: avNormalized.normalized52WeekLow,
          normalized52WeekSource: avNormalized.normalized52WeekSource,
          source: 'alpha_vantage_fallback',
        };
      } catch (avErr) {
        console.warn('[FUNDAMENTALS] AV fallback error:', avErr.message);
        return polygonResult.name ? polygonResult : null;
      }
    }

    return polygonResult;
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