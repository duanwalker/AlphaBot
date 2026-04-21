/**
 * AlpacaAdapter.js
 * Implements BrokerInterface for the Alpaca paper/live trading API.
 *
 * All raw Alpaca field names are preserved alongside the standard shape
 * fields so existing UI components continue to work without change.
 */

import { BrokerInterface } from "./BrokerInterface.js";
import { buildCacheKey, deleteCacheKey, getOrSetCache } from "../services/cache.js";
import { attachEntityScope, attachEntityScopeList } from "../services/entityMetadata.js";

export class AlpacaAdapter extends BrokerInterface {
  constructor() {
    super();
    this._baseUrl = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
    this._dataUrl = "https://data.alpaca.markets";
  }

  // ─── internal helpers ───────────────────────────────────────

  _headers(userId) {
    void userId; // reserved for per-user credential lookup
    return {
      "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
      "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      "Content-Type": "application/json",
    };
  }

  async _fetch(path, userId, options = {}) {
    const response = await fetch(`${this._baseUrl}${path}`, {
      headers: this._headers(userId),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`Alpaca ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  // ─── BrokerInterface implementation ─────────────────────────

  /**
   * Returns raw Alpaca account object.
   * Standard shape overlay: equity, cash, buyingPower, dayPL, dayPLPercent, totalPL.
   * The raw Alpaca fields (portfolio_value, non_marginable_buying_power, etc.) are
   * also present for backward compatibility.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").AccountSummary>}
   */
  async getAccountSummary(userId, tenantId = "alpha-dev") {
    const cacheKey = buildCacheKey("account", userId);

    const raw = await getOrSetCache(cacheKey, () =>
      this._fetch("/v2/account", userId)
    );

    // Overlay standard shape on top of raw Alpaca fields
    const account = {
      ...raw,
      // Standard shape fields mapped from Alpaca equivalents
      equity: raw.equity,
      cash: raw.cash,
      buyingPower: raw.buying_power,
      dayPL: raw.equity && raw.last_equity
        ? parseFloat(raw.equity) - parseFloat(raw.last_equity)
        : null,
      dayPLPercent: raw.equity && raw.last_equity
        ? (((parseFloat(raw.equity) - parseFloat(raw.last_equity)) / parseFloat(raw.last_equity)) * 100).toFixed(2)
        : null,
      totalPL: null, // Alpaca doesn't surface this directly
    };

    return attachEntityScope(account, userId, tenantId);
  }

  /**
   * Returns array of open positions.
   * Standard shape fields: symbol, qty, avgEntryPrice, currentPrice,
   * marketValue, unrealizedPL, unrealizedPLPercent, side, assetClass.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").Position[]>}
   */
  async getPositions(userId, tenantId = "alpha-dev") {
    const cacheKey = buildCacheKey("positions", userId);

    const raw = await getOrSetCache(cacheKey, () =>
      this._fetch("/v2/positions", userId)
    );

    const positions = raw.map((p) => ({
      ...p,
      // Standard shape overlay
      symbol: p.symbol,
      qty: p.qty,
      avgEntryPrice: p.avg_entry_price,
      currentPrice: p.current_price,
      marketValue: p.market_value,
      unrealizedPL: p.unrealized_pl,
      unrealizedPLPercent: p.unrealized_plpc,
      side: p.side,
      assetClass: "equity",
    }));

    return attachEntityScopeList(positions, userId, tenantId);
  }

  /**
   * Returns array of orders (all statuses, last 50).
   * Standard shape fields: id, symbol, qty, side, type, status, filledQty, createdAt.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").Order[]>}
   */
  async getOrders(userId, tenantId = "alpha-dev") {
    const cacheKey = buildCacheKey("orders", userId);

    const raw = await getOrSetCache(cacheKey, () =>
      this._fetch("/v2/orders?status=all&limit=50", userId)
    );

    const orders = raw.map((o) => ({
      ...o,
      // Standard shape overlay
      id: o.id,
      symbol: o.symbol,
      qty: o.qty,
      side: o.side,
      type: o.type,
      status: o.status,
      filledQty: o.filled_qty,
      createdAt: o.created_at,
    }));

    return attachEntityScopeList(orders, userId, tenantId);
  }

  /**
   * Places a new order.
   *
   * @param {object} orderRequest  Alpaca order body
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").Order>}
   */
  async placeOrder(orderRequest, userId, tenantId = "alpha-dev") {
    const data = await this._fetch("/v2/orders", userId, {
      method: "POST",
      body: JSON.stringify(orderRequest),
    });

    // Invalidate stale caches
    deleteCacheKey(buildCacheKey("orders", userId));
    deleteCacheKey(buildCacheKey("positions", userId));

    return attachEntityScope(data, userId, tenantId);
  }

  /**
   * Cancels an existing order.
   *
   * @param {string} orderId
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<void>}
   */
  async cancelOrder(orderId, userId, tenantId = "alpha-dev") {
    void tenantId;
    await this._fetch(`/v2/orders/${orderId}`, userId, { method: "DELETE" });
    deleteCacheKey(buildCacheKey("orders", userId));
  }

  /**
   * Market-status / clock (Alpaca-specific extra; not in base interface).
   * Returns Alpaca clock object: { is_open, next_open, next_close, timestamp }.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async getMarketStatus(userId, tenantId = "alpha-dev") {
    void tenantId;
    return this._fetch("/v2/clock", userId);
  }

  /**
   * Latest NBBO quote for a single equity symbol.
   *
   * @param {string} symbol
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async getQuote(symbol, userId, tenantId = "alpha-dev") {
    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = buildCacheKey("alpacaQuote", normalizedSymbol, userId);

    const quote = await getOrSetCache(cacheKey, async () => {
      const response = await fetch(
        `${this._dataUrl}/v2/stocks/${normalizedSymbol}/quotes/latest`,
        { headers: this._headers(userId) }
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
}
