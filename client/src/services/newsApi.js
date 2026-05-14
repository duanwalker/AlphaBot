function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

export async function getCompanyNews(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    throw new Error("Symbol is required");
  }

  const response = await fetch(`/api/market/news/${encodeURIComponent(normalized)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch news (${response.status})`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.feed) ? payload.feed : [];

  if (!Array.isArray(items) || items.length === 0) {
    console.warn("No news returned for", normalized);
    return [];
  }

  return items
    .filter((article) => article && article.title && article.url && article.time_published)
    .sort((a, b) => new Date(b.time_published) - new Date(a.time_published));
}
