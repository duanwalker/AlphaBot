function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export async function getSentimentSnapshot(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error("Symbol is required");
  return requestJson(`/api/sentiment/${encodeURIComponent(normalized)}`);
}

export async function getSentimentHistory(symbol, days = 30) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error("Symbol is required");

  const safeDays = Number.isFinite(Number(days)) ? Math.max(1, Number(days)) : 30;
  return requestJson(
    `/api/sentiment/${encodeURIComponent(normalized)}/history?days=${encodeURIComponent(safeDays)}`
  );
}

export async function getSentimentWatchlist() {
  return requestJson("/api/sentiment/watchlist");
}

export async function addSentimentWatchlistSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error("Symbol is required");

  return requestJson(`/api/sentiment/watchlist/${encodeURIComponent(normalized)}`, {
    method: "POST",
  });
}

export async function removeSentimentWatchlistSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new Error("Symbol is required");

  return requestJson(`/api/sentiment/watchlist/${encodeURIComponent(normalized)}`, {
    method: "DELETE",
  });
}
