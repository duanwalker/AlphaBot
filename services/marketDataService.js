import axios from "axios";
import {
  buildCacheKey,
  FUNDAMENTALS_TTL,
  HISTORICAL_TTL,
  MARKET_SNAPSHOT_TTL,
  NEWS_TTL,
  QUOTE_TTL,
  getOrSetCache,
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

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const normalized = await normalizePriceData(normalizedSymbol, userId);

    return {
      symbol: normalizedSymbol,
      name: data.Name,
      description: data.Description,
      marketCap: data.MarketCapitalization,
      peRatio: data.PERatio,
      eps: data.EPS,
      dividendYield: data.DividendYield,
      profitMargin: data.ProfitMargin,
      analystTargetPrice: data.AnalystTargetPrice,
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

  const cached = await getOrSetCache(cacheKey, NEWS_TTL, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${normalizedSymbol}&limit=10&apikey=${key}`
    );
    const data = await response.json();
    return data.feed || [];
  });

  return attachEntityScopeList(cached, userId, tenantId);
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