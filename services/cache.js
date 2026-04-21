const cacheStore = new Map();

export function buildCacheKey(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) => String(part))
    .join(":");
}

export async function getOrSetCache(key, loader) {
  if (cacheStore.has(key)) {
    return cacheStore.get(key);
  }

  const value = await loader();
  cacheStore.set(key, value);
  return value;
}

export function deleteCacheKey(key) {
  cacheStore.delete(key);
}

export function deleteCacheByPrefix(prefix) {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}