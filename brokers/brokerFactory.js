/**
 * brokerFactory.js
 * Returns the correct broker adapter instance for a given userId / brokerType.
 *
 * Current behaviour
 * ─────────────────
 * - "alpaca"  → AlpacaAdapter  (default)
 * - "oanda"   → OandaAdapter
 *
 * Future expansion
 * ─────────────────
 * When per-user broker preferences are persisted (e.g. in a user-settings
 * store), replace the brokerType argument with a lookup:
 *
 *   const settings = await getUserSettings(userId);
 *   return createBrokerAdapter(userId, tenantId, settings.defaultBroker);
 */

import { AlpacaAdapter } from "./AlpacaAdapter.js";
import { OandaAdapter } from "./OandaAdapter.js";

/**
 * @param {string} userId
 * @param {string} [tenantId]
 * @param {"alpaca"|"oanda"|string} [brokerType="alpaca"]
 * @returns {import("./BrokerInterface.js").BrokerInterface}
 */
export function createBrokerAdapter(userId, tenantId, brokerType = "alpaca") {
  void userId;
  void tenantId;

  switch (brokerType) {
    case "oanda":
      return new OandaAdapter();
    case "alpaca":
    default:
      return new AlpacaAdapter();
  }
}
