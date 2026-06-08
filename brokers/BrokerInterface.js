/**
 * BrokerInterface.js
 * Defines the contract that every broker adapter must implement.
 *
 * Standard response shapes
 * ─────────────────────────
 * AccountSummary
 *   { equity, cash, buyingPower, dayPL, dayPLPercent, totalPL }
 *
 * Position
 *   { symbol, qty, avgEntryPrice, currentPrice, marketValue,
 *     unrealizedPL, unrealizedPLPercent, side, assetClass }
 *
 * Order
 *   { id, symbol, qty, side, type, status, filledQty, createdAt }
 *
 * Implementations are free to include additional broker-native fields
 * alongside the standard ones to preserve backward compatibility.
 */

/**
 * @typedef {Object} AccountSummary
 * @property {number|string} equity
 * @property {number|string} cash
 * @property {number|string} buyingPower
 * @property {number|string} dayPL
 * @property {number|string} dayPLPercent
 * @property {number|string} totalPL
 */

/**
 * @typedef {Object} Position
 * @property {string}        symbol
 * @property {number|string} qty
 * @property {number|string} avgEntryPrice
 * @property {number|string} currentPrice
 * @property {number|string} marketValue
 * @property {number|string} unrealizedPL
 * @property {number|string} unrealizedPLPercent
 * @property {string}        side       "long" | "short"
 * @property {string}        assetClass "equity" | "forex" | "crypto"
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} symbol
 * @property {number|string} qty
 * @property {string} side     "buy" | "sell"
 * @property {string} type     "market" | "limit" | ...
 * @property {string} status
 * @property {number|string} filledQty
 * @property {string} createdAt  ISO 8601
 */

/**
 * BrokerInterface – all adapters must implement these methods.
 * Each method receives (userId, tenantId) even if unused by the current
 * implementation, so the signature is stable for multi-user / multi-tenant
 * expansion without further interface changes.
 *
 * @abstract
 */
export class BrokerInterface {
  /** @returns {Promise<AccountSummary>} */
  // eslint-disable-next-line no-unused-vars
  async getAccountSummary(userId, tenantId) {
    throw new Error("BrokerInterface.getAccountSummary() must be implemented");
  }

  /** @returns {Promise<Position[]>} */
  // eslint-disable-next-line no-unused-vars
  async getPositions(userId, tenantId) {
    throw new Error("BrokerInterface.getPositions() must be implemented");
  }

  /** @returns {Promise<Order[]>} */
  // eslint-disable-next-line no-unused-vars
  async getOrders(userId, tenantId) {
    throw new Error("BrokerInterface.getOrders() must be implemented");
  }

  /**
   * @param {object} orderRequest
   * @returns {Promise<Order>}
   */
  // eslint-disable-next-line no-unused-vars
  async placeOrder(orderRequest, userId, tenantId) {
    throw new Error("BrokerInterface.placeOrder() must be implemented");
  }

  /** @returns {Promise<void>} */
  // eslint-disable-next-line no-unused-vars
  async cancelOrder(orderId, userId, tenantId) {
    throw new Error("BrokerInterface.cancelOrder() must be implemented");
  }

  /** @returns {Promise<object>} */
  // eslint-disable-next-line no-unused-vars
  async getMarketStatus(userId, tenantId) {
    throw new Error("BrokerInterface.getMarketStatus() must be implemented");
  }

  /**
   * Get latest bid/ask quote for a symbol.
   * @param {string} symbol
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async getQuote(symbol, userId, tenantId) {
    throw new Error("BrokerInterface.getQuote() must be implemented");
  }

  /**
   * Returns available expiration dates for a symbol.
   *
   * @param {string} symbol - Underlying ticker e.g. 'AAPL'
   * @returns {Promise<string[]>} Sorted array of 'YYYY-MM-DD' strings
   */
  // eslint-disable-next-line no-unused-vars
  async getOptionsExpirations(symbol) {
    throw new Error("getOptionsExpirations not implemented");
  }

  /**
   * Returns the full options chain for a symbol and expiry.
   *
   * @param {string} symbol      - Underlying ticker e.g. 'AAPL'
   * @param {string} expiration  - 'YYYY-MM-DD'
   * @param {object} [filters]   - Optional: { type: 'call'|'put', strikeMin, strikeMax }
   * @returns {Promise<NormalizedContract[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async getOptionsChain(symbol, expiration, filters = {}) {
    throw new Error("getOptionsChain not implemented");
  }

  /**
   * Places an options order.
   *
   * @param {object} order - Normalized order object
   * @returns {Promise<OrderResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async placeOptionsOrder(order) {
    throw new Error("placeOptionsOrder not implemented");
  }
}
