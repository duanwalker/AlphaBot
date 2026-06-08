/**
 * AlpacaAdapter.js
 * Implements BrokerInterface for the Alpaca paper/live trading API.
 *
 * All raw Alpaca field names are preserved alongside the standard shape
 * fields so existing UI components continue to work without change.
 */

import { BrokerInterface } from "./BrokerInterface.js";
import {
  ACCOUNT_TTL,
  ORDERS_TTL,
  POSITIONS_TTL,
  QUOTE_TTL,
  buildCacheKey,
  deleteCacheKey,
  getOrSetCache,
} from "../services/cache.js";
import { attachEntityScope, attachEntityScopeList } from "../services/entityMetadata.js";

export class AlpacaAdapter extends BrokerInterface {
  constructor(config = {}) {
    super();
    this._baseUrl  = config.baseUrl  || process.env.ALPACA_BASE_URL  || "https://paper-api.alpaca.markets";
    this._apiKey   = config.apiKey   || process.env.ALPACA_API_KEY;
    this._secretKey = config.secretKey || process.env.ALPACA_SECRET_KEY;
    this._dataUrl  = "https://data.alpaca.markets";
  }

  // ─── internal helpers ───────────────────────────────────────

  _headers(userId) {
    void userId;
    return {
      "APCA-API-KEY-ID": this._apiKey,
      "APCA-API-SECRET-KEY": this._secretKey,
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
    const cacheKey = buildCacheKey("account", [`user:${userId}`]);

    const raw = await getOrSetCache(cacheKey, ACCOUNT_TTL, () =>
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
    const cacheKey = buildCacheKey("positions", [`user:${userId}`]);

    const raw = await getOrSetCache(cacheKey, POSITIONS_TTL, () =>
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
    const cacheKey = buildCacheKey("orders", [`user:${userId}`]);

    const raw = await getOrSetCache(cacheKey, ORDERS_TTL, () =>
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
    deleteCacheKey(buildCacheKey("orders", [`user:${userId}`]));
    deleteCacheKey(buildCacheKey("positions", [`user:${userId}`]));
    deleteCacheKey(buildCacheKey("account", [`user:${userId}`]));

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
    deleteCacheKey(buildCacheKey("orders", [`user:${userId}`]));
    deleteCacheKey(buildCacheKey("positions", [`user:${userId}`]));
    deleteCacheKey(buildCacheKey("account", [`user:${userId}`]));
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

  // ─── Options methods ─────────────────────────────────────────

  /**
   * Returns sorted unique expiration dates for an underlying symbol.
   *
   * @param {string} symbol - e.g. 'AAPL'
   * @returns {Promise<string[]>} 'YYYY-MM-DD' strings, sorted ascending
   */
  async getOptionsExpirations(symbol) {
    const today = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      underlying_symbols: symbol,
      status: "active",
      limit: "10000",
      expiration_date_gte: today,
    });

    const response = await fetch(
      `${this._baseUrl}/v2/options/contracts?${params}`,
      {
        headers: {
          "APCA-API-KEY-ID": this._apiKey,
          "APCA-API-SECRET-KEY": this._secretKey,
          accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Alpaca options/contracts ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const contracts = data.option_contracts || [];

    return [...new Set(contracts.map((c) => c.expiration_date).filter(Boolean))].sort();
  }

  /**
   * Returns a normalized options chain for a symbol and expiration date.
   *
   * @param {string} symbol      - e.g. 'AAPL'
   * @param {string} expiration  - 'YYYY-MM-DD'
   * @param {object} [filters]   - { type, strikeMin, strikeMax }
   * @returns {Promise<NormalizedContract[]>}
   */
  async getOptionsChain(symbol, expiration, filters = {}) {
    if (!expiration) return [];
    try {
      const params = new URLSearchParams({
        expiration_date: expiration,
        feed: "indicative",
        limit: "250",
      });

      if (filters.type) params.set("type", filters.type);
      if (filters.strikeMin) params.set("strike_price_gte", filters.strikeMin);
      if (filters.strikeMax) params.set("strike_price_lte", filters.strikeMax);

      const response = await fetch(
        `${this._dataUrl}/v1beta1/options/snapshots/${symbol}?${params}`,
        {
          headers: {
            "APCA-API-KEY-ID": this._apiKey,
            "APCA-API-SECRET-KEY": this._secretKey,
            accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error(`[OPTIONS] Alpaca chain ${response.status}:`, (await response.text()).slice(0, 200));
        return [];
      }

      const data = await response.json();
      const snapshots = data.snapshots || {};

      if (Object.keys(snapshots).length === 0) return [];

      return Object.entries(snapshots).flatMap(([contractSymbol, snap]) => {
        const match = contractSymbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
        if (!match) return [];

        const [, underlying, dateStr, typeChar, strikeStr] = match;
        return [{
          symbol:            contractSymbol,
          underlying,
          contractType:      typeChar === "C" ? "call" : "put",
          strike:            parseInt(strikeStr, 10) / 1000,
          expiry:            `20${dateStr.slice(0, 2)}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`,
          bid:               snap.latestQuote?.bp ?? 0,
          ask:               snap.latestQuote?.ap ?? 0,
          last:              snap.latestTrade?.p ?? 0,
          volume:            snap.latestTrade?.s ?? 0,
          openInterest:      snap.openInterest ?? 0,
          impliedVolatility: snap.impliedVolatility ?? 0,
          greeks: {
            delta: snap.greeks?.delta ?? null,
            gamma: snap.greeks?.gamma ?? null,
            theta: snap.greeks?.theta ?? null,
            vega:  snap.greeks?.vega  ?? null,
          },
        }];
      });
    } catch (err) {
      console.error('[AlpacaAdapter] getOptionsChain error:', err.message, err.status ?? '');
      return [];
    }
  }

  /**
   * Places a normalized options order via Alpaca.
   *
   * @param {object} order - { symbol, side, qty, orderType, limitPrice, timeInForce }
   *   side values: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close'
   * @returns {Promise<{ orderId, status, symbol, side, qty, filledAt }>}
   */
  async placeOptionsOrder(order) {
    const sideMap = {
      buy_to_open:   { side: "buy",  position_intent: "open" },
      sell_to_open:  { side: "sell", position_intent: "open" },
      buy_to_close:  { side: "buy",  position_intent: "close" },
      sell_to_close: { side: "sell", position_intent: "close" },
    };

    const mapped = sideMap[order.side] || { side: order.side, position_intent: "open" };

    const payload = {
      symbol:          order.symbol,
      qty:             order.qty.toString(),
      side:            mapped.side,
      type:            order.orderType,
      time_in_force:   order.timeInForce,
      position_intent: mapped.position_intent,
    };

    if (order.orderType === "limit") {
      payload.limit_price = order.limitPrice.toString();
    }

    const response = await fetch(`${this._baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": this._apiKey,
        "APCA-API-SECRET-KEY": this._secretKey,
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Alpaca order ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return {
      orderId:  data.id,
      status:   data.status,
      symbol:   data.symbol,
      side:     data.side,
      qty:      parseFloat(data.qty),
      filledAt: data.filled_at || null,
    };
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
    const cacheKey = buildCacheKey("brokerQuote", [`user:${userId}`, "alpaca", normalizedSymbol]);

    const quote = await getOrSetCache(cacheKey, QUOTE_TTL, async () => {
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
