import axios from "axios";
import { buildCacheKey, getOrSetCache } from "./cache.js";
import { attachEntityScope, attachEntityScopeList } from "./entityMetadata.js";
import { getAlpacaQuote } from "./brokerService.js";
import { normalizePriceData } from "./normalizePriceData.js";
import { fetchYahooHistorical } from "./yahooHistorical.js";
import { normalizeHistoricalData } from "./normalizeHistoricalData.js";

const DEFAULT_MARKET_SNAPSHOT_SYMBOLS = ["AAPL", "MSFT", "AMZN", "NVDA", "INTC"];

export async function getFundamentals(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("fundamentals", normalizedSymbol, userId);

  return getOrSetCache(cacheKey, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${normalizedSymbol}&apikey=${key}`;
    const response = await axios.get(url);
    const data = response.data;

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const normalized = await normalizePriceData(normalizedSymbol, userId);

    return attachEntityScope({
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
    }, userId, tenantId);
  });
}

export async function getHistorical(symbol, timeframe = "1y", userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const normalizedTimeframe = String(timeframe || "1y").toLowerCase();
  const cacheKey = buildCacheKey("history", normalizedSymbol, normalizedTimeframe, userId);

  return getOrSetCache(cacheKey, async () => {
    const raw = await fetchYahooHistorical(normalizedSymbol, normalizedTimeframe, userId);
    if (!raw || (Array.isArray(raw) && raw.length === 0)) {
      return null;
    }

    const candles = normalizeHistoricalData(raw);
    if (candles.length === 0) {
      return null;
    }

    return attachEntityScope({
      symbol: normalizedSymbol,
      timeframe: normalizedTimeframe,
      candles,
      source: "yahoo_historical",
    }, userId, tenantId);
  });
}

export async function getMarketQuote(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("quote", normalizedSymbol, userId);

  return getOrSetCache(cacheKey, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${normalizedSymbol}&apikey=${key}`
    );
    const data = await response.json();
    return attachEntityScope(data["Global Quote"] || {}, userId, tenantId);
  });
}

export async function getMarketNews(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("news", normalizedSymbol, userId);

  return getOrSetCache(cacheKey, async () => {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    const response = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${normalizedSymbol}&limit=10&apikey=${key}`
    );
    const data = await response.json();
    return attachEntityScopeList(data.feed || [], userId, tenantId);
  });
}

export async function getMarketSnapshot(userId, tenantId = "alpha-dev") {
  const cacheKey = buildCacheKey("marketSnapshot", userId);

  return getOrSetCache(cacheKey, async () => {
    const quotes = await Promise.all(
      DEFAULT_MARKET_SNAPSHOT_SYMBOLS.map((symbol) => getAlpacaQuote(symbol, userId, tenantId))
    );
    return attachEntityScopeList(quotes, userId, tenantId);
  });
}