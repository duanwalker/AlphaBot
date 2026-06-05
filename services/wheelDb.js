import 'dotenv/config';
import { TableClient } from '@azure/data-tables';

const POSITIONS_TABLE = 'wheelPositions';
const CYCLES_TABLE    = 'wheelCycles';
const INCOME_TABLE    = 'wheelIncome';

function getConnectionString() {
  return (
    String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim() ||
    process.env.AZURE_TABLE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    ''
  );
}

function getClient(tableName) {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing Azure Table Storage connection string. Set AZURE_STORAGE_CONNECTION_STRING.');
  }
  return TableClient.fromConnectionString(connectionString, tableName);
}

async function ensureTable(tableName) {
  try {
    await getClient(tableName).createTable();
  } catch (err) {
    if (err?.statusCode !== 409) throw err;
  }
}

export async function initWheelTables() {
  await ensureTable(POSITIONS_TABLE);
  await ensureTable(CYCLES_TABLE);
  await ensureTable(INCOME_TABLE);
}

function normalizePosition(entity) {
  return {
    ...entity,
    strike:       parseFloat(entity.strike       ?? null),
    premium:      parseFloat(entity.premium      ?? null),
    shares:       parseInt(entity.shares         ?? null),
    costBasis:    parseFloat(entity.costBasis    ?? null),
    currentPrice: parseFloat(entity.currentPrice ?? null),
    breakeven:    parseFloat(entity.breakeven    ?? null),
    closedAt:     entity.closedAt    ?? null,
    assignedAt:   entity.assignedAt  ?? null,
    calledAwayAt: entity.calledAwayAt ?? null,
    expiresAt:    entity.expiresAt   ?? null,
  };
}

// ── Positions ──────────────────────────────────────────────────────────────

export async function createPosition(userId, positionData) {
  const client     = getClient(POSITIONS_TABLE);
  const ticker     = positionData.ticker || 'unknown';
  const positionId = `wheel_${Date.now()}_${ticker}`;
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       positionId,
    ...positionData,
    status:    'open',
    assigned:  false,
    calledAway: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'Replace');
  return positionId;
}

export async function updatePosition(userId, positionId, updates) {
  const client = getClient(POSITIONS_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       positionId,
    ...updates,
    updatedAt: new Date().toISOString(),
  }, 'Merge');
}

export async function getOpenPositions(userId) {
  const client  = getClient(POSITIONS_TABLE);
  const results = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}' and status eq 'open'` },
  })) {
    results.push(normalizePosition(entity));
  }
  return results;
}

export async function getAllPositions(userId, limit = 50) {
  const client  = getClient(POSITIONS_TABLE);
  const results = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}'` },
  })) {
    results.push(normalizePosition(entity));
  }
  return results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ── Cycles ─────────────────────────────────────────────────────────────────

export async function createCycle(userId, cycleData) {
  const client = getClient(CYCLES_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       cycleData.cycleId,
    ...cycleData,
    status:    'csp_open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'Replace');
  return cycleData.cycleId;
}

export async function updateCycle(userId, cycleId, updates) {
  const client = getClient(CYCLES_TABLE);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey:       cycleId,
    ...updates,
    updatedAt: new Date().toISOString(),
  }, 'Merge');
}

export async function getActiveCycles(userId) {
  const client  = getClient(CYCLES_TABLE);
  const results = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}' and status ne 'complete'` },
  })) {
    results.push(entity);
  }
  return results;
}

export async function getAllCycles(userId, limit = 50) {
  const client  = getClient(CYCLES_TABLE);
  const results = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}'` },
  })) {
    results.push(entity);
  }
  return results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ── Income ─────────────────────────────────────────────────────────────────

export async function updateMonthlyIncome(userId, month, delta) {
  const client = getClient(INCOME_TABLE);
  let existing = null;
  try {
    existing = await client.getEntity(userId, month);
  } catch {
    // No record yet — first entry this month
  }
  const currentPremium = parseFloat(existing?.premiumCollected || 0);
  const currentCycles  = parseInt(existing?.cyclesOpen || 0);

  await client.upsertEntity({
    partitionKey:     userId,
    rowKey:           month,
    premiumCollected: currentPremium + parseFloat(delta.premiumCollected || 0),
    cyclesOpen:       currentCycles  + parseInt(delta.cyclesOpen || 0),
    cyclesCompleted:  existing?.cyclesCompleted || 0,
    assignmentCount:  existing?.assignmentCount  || 0,
    calledAwayCount:  existing?.calledAwayCount  || 0,
    updatedAt:        new Date().toISOString(),
  }, 'Replace');
}

export async function getMonthlyIncome(userId, months = 12) {
  const client  = getClient(INCOME_TABLE);
  const results = [];
  for await (const entity of client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${userId}'` },
  })) {
    results.push(entity);
  }
  return results
    .sort((a, b) => b.rowKey.localeCompare(a.rowKey))
    .slice(0, months);
}
