/**
 * OandaAdapter.js
 * Implements BrokerInterface for the OANDA fxTrade Practice REST v3 API.
 *
 * Raw OANDA response fields are preserved for backward compatibility;
 * the standard shape fields are mapped alongside them.
 */

import { BrokerInterface } from "./BrokerInterface.js";
import { buildCacheKey, deleteCacheByPrefix, getOrSetCache } from "../services/cache.js";
import { attachEntityScope } from "../services/entityMetadata.js";

export class OandaAdapter extends BrokerInterface {
  constructor() {
    super();
    this._baseUrl = process.env.OANDA_BASE_URL || "https://api-fxpractice.oanda.com";
    this._accountId = process.env.OANDA_ACCOUNT_ID;
  }

  // ─── internal helpers ───────────────────────────────────────

  _headers(userId) {
    void userId; // reserved for per-user credential lookup
    return {
      Authorization: `Bearer ${process.env.OANDA_API_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async _fetch(path, userId, options = {}) {
    const response = await fetch(`${this._baseUrl}${path}`, {
      headers: this._headers(userId),
      ...options,
    });

    if (!response.ok) {
      throw new Error(`OANDA ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  // ─── BrokerInterface implementation ─────────────────────────

  /**
   * Returns OANDA account summary.
   * Standard shape overlay: equity → NAV, cash → balance, buyingPower → marginAvailable,
   * dayPL → unrealizedPL, dayPLPercent derived, totalPL → pl.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").AccountSummary>}
   */
  async getAccountSummary(userId, tenantId = "alpha-dev") {
    const cacheKey = buildCacheKey("oandaAccount", userId);

    const raw = await getOrSetCache(cacheKey, () =>
      this._fetch(`/v3/accounts/${this._accountId}/summary`, userId)
    );

    const summary = raw.account || raw;

    const nav = parseFloat(summary.NAV || 0);
    const balance = parseFloat(summary.balance || 0);
    const unrealizedPL = parseFloat(summary.unrealizedPL || 0);

    const account = {
      ...raw,
      // Standard shape overlay
      equity: nav,
      cash: balance,
      buyingPower: parseFloat(summary.marginAvailable || 0),
      dayPL: unrealizedPL,
      dayPLPercent: balance
        ? ((unrealizedPL / balance) * 100).toFixed(2)
        : null,
      totalPL: parseFloat(summary.pl || 0),
    };

    return attachEntityScope(account, userId, tenantId);
  }

  /**
   * Returns open forex positions.
   * Standard shape: symbol, qty, avgEntryPrice, currentPrice, marketValue,
   * unrealizedPL, unrealizedPLPercent, side, assetClass: "forex".
   *
   * @param {string} userId
   * @param {string} [tenantId]
   * @returns {Promise<import("./BrokerInterface.js").Position[]>}
   */
  async getPositions(userId, tenantId = "alpha-dev") {
    const cacheKey = buildCacheKey("oandaPositions", userId);

    const raw = await getOrSetCache(cacheKey, () =>
      this._fetch(`/v3/accounts/${this._accountId}/openPositions`, userId)
    );

    // Attach entity scope to the raw object (preserves OANDA structure).
    // Standard shape normalization of individual positions is best-effort
    // since OANDA bundles long/short sides per instrument.
    const positions = (raw.positions || []).map((p) => {
      const longUnits = parseFloat(p.long?.units || 0);
      const shortUnits = parseFloat(p.short?.units || 0);
      const dominantSide = Math.abs(longUnits) >= Math.abs(shortUnits) ? "long" : "short";
      const side = dominantSide;
      const units = side === "long" ? longUnits : shortUnits;
      const unrealizedPL = parseFloat(
        side === "long" ? p.long?.unrealizedPL : p.short?.unrealizedPL || 0
      );
      const avgPrice = parseFloat(
        side === "long" ? p.long?.averagePrice : p.short?.averagePrice || 0
      );

      return {
        ...p,
        // Standard shape overlay
        symbol: p.instrument,
        qty: units,
        avgEntryPrice: avgPrice,
        currentPrice: null, // requires separate price call
        marketValue: null,
        unrealizedPL,
        unrealizedPLPercent: avgPrice && units
          ? ((unrealizedPL / (Math.abs(units) * avgPrice)) * 100).toFixed(2)
          : null,
        side,
        assetClass: "forex",
      };
    });

    return attachEntityScope({ ...raw, positions }, userId, tenantId);
  }

  /**
   * OANDA does not have a simple "orders" endpoint equivalent to Alpaca.
   * Returns pending orders for the configured account.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async getOrders(userId, tenantId = "alpha-dev") {
    void tenantId;
    const raw = await this._fetch(
      `/v3/accounts/${this._accountId}/pendingOrders`,
      userId
    );
    return attachEntityScope(raw, userId, tenantId);
  }

  /**
   * Places an OANDA market/limit order.
   *
   * @param {object} orderRequest  OANDA order body (sent as { order: orderRequest })
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async placeOrder(orderRequest, userId, tenantId = "alpha-dev") {
    const data = await this._fetch(
      `/v3/accounts/${this._accountId}/orders`,
      userId,
      {
        method: "POST",
        body: JSON.stringify({ order: orderRequest }),
      }
    );

    deleteCacheByPrefix(buildCacheKey("oandaPositions", userId));
    return attachEntityScope(data, userId, tenantId);
  }

  /**
   * Cancels a pending OANDA order.
   *
   * @param {string} orderId
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async cancelOrder(orderId, userId, tenantId = "alpha-dev") {
    void tenantId;
    await this._fetch(
      `/v3/accounts/${this._accountId}/orders/${orderId}/cancel`,
      userId,
      { method: "PUT" }
    );
  }

  /**
   * OANDA market hours / tradeable instruments.
   * Returns a best-effort status object since OANDA is a 24/5 FX market.
   *
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async getMarketStatus(userId, tenantId = "alpha-dev") {
    void tenantId;
    // OANDA FX is open 24/5; return a static status with live server check.
    const data = await this._fetch(`/v3/accounts/${this._accountId}`, userId);
    return {
      is_open: true,
      market: "forex",
      message: "OANDA FX operates 24/5 (Sun 5 PM – Fri 5 PM ET)",
      accountState: data?.account?.id ? "active" : "unknown",
    };
  }

  /**
   * Latest mid-price for a forex instrument (e.g. "EUR/USD" or "EUR_USD").
   *
   * @param {string} pair
   * @param {string} userId
   * @param {string} [tenantId]
   */
  async getQuote(pair, userId, tenantId = "alpha-dev") {
    const instrument = pair.replace("/", "_");
    const cacheKey = buildCacheKey("oandaPrice", instrument, userId);

    const data = await getOrSetCache(cacheKey, () =>
      this._fetch(
        `/v3/instruments/${instrument}/candles?count=1&granularity=S5&price=M`,
        userId
      )
    );

    return attachEntityScope(data, userId, tenantId);
  }
}
