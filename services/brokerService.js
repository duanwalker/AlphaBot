import { buildCacheKey, deleteCacheByPrefix, deleteCacheKey, getOrSetCache } from "./cache.js";
import { attachEntityScope, attachEntityScopeList } from "./entityMetadata.js";

function alpacaHeaders(userId) {
  void userId;
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
    "Content-Type": "application/json",
  };
}

export async function alpacaFetch(path, userId, options = {}) {
  const base = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  const response = await fetch(`${base}${path}`, {
    headers: alpacaHeaders(userId),
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Alpaca ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export async function getAlpacaAccount(userId, tenantId = "alpha-dev") {
  const cacheKey = buildCacheKey("account", userId);
  const account = await getOrSetCache(cacheKey, () => alpacaFetch("/v2/account", userId));
  return attachEntityScope(account, userId, tenantId);
}

export async function getAlpacaPositions(userId, tenantId = "alpha-dev") {
  const cacheKey = buildCacheKey("positions", userId);
  const positions = await getOrSetCache(cacheKey, () => alpacaFetch("/v2/positions", userId));
  return attachEntityScopeList(positions, userId, tenantId);
}

export async function getAlpacaOrders(userId, tenantId = "alpha-dev") {
  const cacheKey = buildCacheKey("orders", userId);
  const orders = await getOrSetCache(cacheKey, () => alpacaFetch("/v2/orders?status=all&limit=50", userId));
  return attachEntityScopeList(orders, userId, tenantId);
}

export async function createAlpacaOrder(order, userId, tenantId = "alpha-dev") {
  const data = await alpacaFetch("/v2/orders", userId, {
    method: "POST",
    body: JSON.stringify(order),
  });

  deleteCacheKey(buildCacheKey("orders", userId));
  deleteCacheKey(buildCacheKey("positions", userId));
  return attachEntityScope(data, userId, tenantId);
}

export async function cancelAlpacaOrder(orderId, userId) {
  await alpacaFetch(`/v2/orders/${orderId}`, userId, { method: "DELETE" });
  deleteCacheKey(buildCacheKey("orders", userId));
}

export async function getAlpacaQuote(symbol, userId, tenantId = "alpha-dev") {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = buildCacheKey("alpacaQuote", normalizedSymbol, userId);

  const quote = await getOrSetCache(cacheKey, async () => {
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${normalizedSymbol}/quotes/latest`,
      { headers: alpacaHeaders(userId) }
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
  });

  return attachEntityScope(quote, userId, tenantId);
}

function oandaHeaders(userId) {
  void userId;
  return {
    Authorization: `Bearer ${process.env.OANDA_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function oandaFetch(path, userId, options = {}) {
  const base = process.env.OANDA_BASE_URL || "https://api-fxpractice.oanda.com";
  const response = await fetch(`${base}${path}`, {
    headers: oandaHeaders(userId),
    ...options,
  });

  if (!response.ok) {
    throw new Error(`OANDA ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export async function getOandaAccount(userId, tenantId = "alpha-dev") {
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const cacheKey = buildCacheKey("oandaAccount", userId);
  const data = await getOrSetCache(cacheKey, () => oandaFetch(`/v3/accounts/${accountId}/summary`, userId));
  return attachEntityScope(data, userId, tenantId);
}

export async function getOandaPositions(userId, tenantId = "alpha-dev") {
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const cacheKey = buildCacheKey("oandaPositions", userId);
  const data = await getOrSetCache(cacheKey, () => oandaFetch(`/v3/accounts/${accountId}/openPositions`, userId));
  return attachEntityScope(data, userId, tenantId);
}

export async function createOandaOrder(order, userId, tenantId = "alpha-dev") {
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const data = await oandaFetch(`/v3/accounts/${accountId}/orders`, userId, {
    method: "POST",
    body: JSON.stringify({ order }),
  });

  deleteCacheByPrefix(buildCacheKey("oandaPositions", userId));
  return attachEntityScope(data, userId, tenantId);
}

export async function getOandaPrice(pair, userId, tenantId = "alpha-dev") {
  const instrument = pair.replace("/", "_");
  const cacheKey = buildCacheKey("oandaPrice", instrument, userId);
  const data = await getOrSetCache(cacheKey, () => oandaFetch(
    `/v3/instruments/${instrument}/candles?count=1&granularity=S5&price=M`,
    userId
  ));
  return attachEntityScope(data, userId, tenantId);
}