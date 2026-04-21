const sharedCacheStore = new Map();
const userCacheStore = new Map();

const SHARED_NAMESPACES = new Set([
  "fundamentals",
  "history",
  "quote",
  "news",
  "snapshot",
]);

const USER_NAMESPACES = new Set([
  "account",
  "positions",
  "orders",
  "brokerQuote",
]);

export const FUNDAMENTALS_TTL = 24 * 60 * 60 * 1000;
export const HISTORICAL_TTL = 24 * 60 * 60 * 1000;
export const QUOTE_TTL = 60 * 1000;
export const NEWS_TTL = 5 * 60 * 1000;
export const MARKET_SNAPSHOT_TTL = 30 * 1000;
export const POSITIONS_TTL = 30 * 1000;
export const ORDERS_TTL = 30 * 1000;
export const ACCOUNT_TTL = 30 * 1000;

function normalizePart(part) {
  if (part === undefined || part === null || part === "") {
    return null;
  }
  return String(part);
}

function resolvePartition(namespace, keyParts) {
  if (USER_NAMESPACES.has(namespace)) {
    return "user";
  }

  if (SHARED_NAMESPACES.has(namespace)) {
    return "shared";
  }

  const parts = (keyParts || []).map(normalizePart).filter(Boolean);
  if (parts.length > 0 && parts[0].startsWith("user:")) {
    return "user";
  }

  return "shared";
}

function packEntry(value, ttlMs) {
  return {
    value,
    expiresAt: Number.isFinite(ttlMs) && ttlMs > 0 ? Date.now() + ttlMs : null,
  };
}

function isExpired(entry) {
  return !!entry?.expiresAt && Date.now() > entry.expiresAt;
}

function parseKey(cacheKey) {
  if (typeof cacheKey === "string") {
    return { partition: "shared", key: cacheKey };
  }

  if (!cacheKey || typeof cacheKey !== "object") {
    throw new Error("Invalid cache key");
  }

  const partition = cacheKey.partition === "user" ? "user" : "shared";
  return { partition, key: cacheKey.key, userId: cacheKey.userId || null };
}

function getStore(partition) {
  return partition === "user" ? userCacheStore : sharedCacheStore;
}

/**
 * buildCacheKey(namespace, keyParts[])
 *
 * For user-scoped namespaces, pass keyParts with first element as user marker,
 * e.g. ["user:123", "AAPL"] so deleteUserCache can invalidate quickly.
 */
export function buildCacheKey(namespace, keyParts = []) {
  const parts = [normalizePart(namespace), ...(keyParts || []).map(normalizePart)]
    .filter(Boolean);
  const key = parts.join(":");
  const partition = resolvePartition(namespace, keyParts);

  let userId = null;
  if (partition === "user") {
    const rawUserPart = (keyParts || [])
      .map(normalizePart)
      .find((part) => part && part.startsWith("user:"));
    userId = rawUserPart ? rawUserPart.slice(5) : null;
  }

  return { partition, key, userId };
}

export function getCache(cacheKey) {
  const parsed = parseKey(cacheKey);
  const store = getStore(parsed.partition);
  const entry = store.get(parsed.key);

  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    store.delete(parsed.key);
    return null;
  }

  return entry.value;
}

export function setCache(cacheKey, value, ttlMs) {
  const parsed = parseKey(cacheKey);
  const store = getStore(parsed.partition);
  store.set(parsed.key, packEntry(value, ttlMs));
  return value;
}

export async function getOrSetCache(cacheKey, ttlMs, asyncFetcher) {
  const cachedValue = getCache(cacheKey);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const freshValue = await asyncFetcher();
  setCache(cacheKey, freshValue, ttlMs);
  return freshValue;
}

export function deleteCacheKey(cacheKey) {
  const parsed = parseKey(cacheKey);
  const store = getStore(parsed.partition);
  store.delete(parsed.key);
}

export function deleteCacheByPrefix(prefix) {
  const parsedPrefix = parseKey(prefix);
  const store = getStore(parsedPrefix.partition);

  for (const key of store.keys()) {
    if (key.startsWith(parsedPrefix.key)) {
      store.delete(key);
    }
  }
}

export function deleteUserCache(userId) {
  if (!userId) {
    return;
  }

  const userPrefix = `user:${userId}`;
  for (const key of userCacheStore.keys()) {
    if (key.includes(`:${userPrefix}`) || key.endsWith(userPrefix)) {
      userCacheStore.delete(key);
    }
  }
}