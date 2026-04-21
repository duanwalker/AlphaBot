/**
 * services/brokerService.js
 * High-level broker facade used by all route handlers in server.js.
 *
 * Every function delegates to the correct adapter via createBrokerAdapter().
 * Route handlers never import adapters directly - all broker traffic flows
 * through this service, making broker selection a single-point concern.
 *
 * Alpaca-specific helpers (getAlpacaQuote) and OANDA-specific helpers
 * (getOandaPrice) are preserved with their original signatures so that
 * server.js requires no route-level changes.
 */

import { createBrokerAdapter } from "../brokers/brokerFactory.js";

// --- Alpaca ----------------------------------------------------------

export async function getAlpacaAccount(userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.getAccountSummary(userId, tenantId);
}

export async function getAlpacaPositions(userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.getPositions(userId, tenantId);
}

export async function getAlpacaOrders(userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.getOrders(userId, tenantId);
}

export async function createAlpacaOrder(order, userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.placeOrder(order, userId, tenantId);
}

export async function cancelAlpacaOrder(orderId, userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.cancelOrder(orderId, userId, tenantId);
}

export async function getAlpacaQuote(symbol, userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "alpaca");
  return adapter.getQuote(symbol, userId, tenantId);
}

// --- OANDA -----------------------------------------------------------

export async function getOandaAccount(userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "oanda");
  return adapter.getAccountSummary(userId, tenantId);
}

export async function getOandaPositions(userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "oanda");
  return adapter.getPositions(userId, tenantId);
}

export async function createOandaOrder(order, userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "oanda");
  return adapter.placeOrder(order, userId, tenantId);
}

export async function getOandaPrice(pair, userId, tenantId) {
  const adapter = createBrokerAdapter(userId, tenantId, "oanda");
  return adapter.getQuote(pair, userId, tenantId);
}

// --- Generic unified API (broker-agnostic) ---------------------------

export async function getAccountSummary(userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.getAccountSummary(userId, tenantId);
}

export async function getPositions(userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.getPositions(userId, tenantId);
}

export async function getOrders(userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.getOrders(userId, tenantId);
}

export async function placeOrder(order, userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.placeOrder(order, userId, tenantId);
}

export async function cancelOrder(orderId, userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.cancelOrder(orderId, userId, tenantId);
}

export async function getMarketStatus(userId, tenantId, brokerType = "alpaca") {
  const adapter = createBrokerAdapter(userId, tenantId, brokerType);
  return adapter.getMarketStatus(userId, tenantId);
}
