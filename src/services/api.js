// src/services/api.js
// All API calls go through this file. Change BASE_URL if your server runs elsewhere.

const BASE = "http://localhost:3001/api";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export async function aiChat(userMessage, systemPrompt) {
  return req("/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    }),
  });
}

// ─── Alpaca ───────────────────────────────────────────────────────────────────

export const alpaca = {
  getAccount: () => req("/alpaca/account"),
  getPositions: () => req("/alpaca/positions"),
  getOrders: () => req("/alpaca/orders"),
  placeOrder: (order) =>
    req("/alpaca/orders", { method: "POST", body: JSON.stringify(order) }),
  cancelOrder: (id) => req(`/alpaca/orders/${id}`, { method: "DELETE" }),
  getQuote: (symbol) => req(`/alpaca/quote/${symbol}`),
};

// ─── OANDA ────────────────────────────────────────────────────────────────────

export const oanda = {
  getAccount: () => req("/oanda/account"),
  getPositions: () => req("/oanda/positions"),
  placeOrder: (order) =>
    req("/oanda/orders", { method: "POST", body: JSON.stringify(order) }),
  getPrice: (pair) => req(`/oanda/price/${pair}`),
};

// ─── Market Data ──────────────────────────────────────────────────────────────

export const market = {
  getQuote: (symbol) => req(`/market/quote/${symbol}`),
  getNews: (symbol) => req(`/market/news/${symbol}`),
};

export const health = () => req("/health");
