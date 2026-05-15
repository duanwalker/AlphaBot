function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.details
      ? `${data?.error || "Request failed"}: ${data.details}`
      : (data?.error || `Request failed (${response.status})`);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function getWatchlist() {
  const data = await requestJson("/api/sentiment/watchlist");
  return Array.isArray(data?.watchlist) ? data.watchlist : [];
}

export async function removeFromWatchlist(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    throw new Error("Symbol is required");
  }

  try {
    return await requestJson(`/api/sentiment/watchlist/${encodeURIComponent(normalized)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }

    return requestJson(`/api/watchlist/${encodeURIComponent(normalized)}`, {
      method: "DELETE",
    });
  }
}

export async function addToWatchlist(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    throw new Error("Symbol is required");
  }

  return requestJson(`/api/sentiment/watchlist/${encodeURIComponent(normalized)}`, {
    method: "POST",
  });
}
