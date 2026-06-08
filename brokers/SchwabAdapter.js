/**
 * SchwabAdapter.js
 * Stub implementing BrokerInterface for Charles Schwab.
 *
 * Key differences from AlpacaAdapter to implement when ready:
 *   - OAuth 2.0 with token refresh (not API key headers) — requires a
 *     separate token management service
 *   - Options chain endpoint: GET /marketdata/v1/chains
 *   - Order endpoint: POST /trader/v1/accounts/{accountId}/orders
 *   - Historical options data is NOT available via the Schwab API
 *   - Developer app approval takes several days — start early
 *   - Requires a Schwab brokerage account linked to the developer app
 */

import { BrokerInterface } from "./BrokerInterface.js";

export class SchwabAdapter extends BrokerInterface {
  async getAccountSummary() {
    throw new Error("SchwabAdapter: getAccountSummary not yet implemented");
  }

  async getPositions() {
    throw new Error("SchwabAdapter: getPositions not yet implemented");
  }

  async getOrders() {
    throw new Error("SchwabAdapter: getOrders not yet implemented");
  }

  async placeOrder() {
    throw new Error("SchwabAdapter: placeOrder not yet implemented");
  }

  async cancelOrder() {
    throw new Error("SchwabAdapter: cancelOrder not yet implemented");
  }

  async getMarketStatus() {
    throw new Error("SchwabAdapter: getMarketStatus not yet implemented");
  }

  async getQuote() {
    throw new Error("SchwabAdapter: getQuote not yet implemented");
  }

  async getOptionsExpirations() {
    throw new Error("SchwabAdapter: getOptionsExpirations not yet implemented");
  }

  async getOptionsChain() {
    throw new Error("SchwabAdapter: getOptionsChain not yet implemented");
  }

  async placeOptionsOrder() {
    throw new Error("SchwabAdapter: placeOptionsOrder not yet implemented");
  }
}
