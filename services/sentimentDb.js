import { TableClient } from "@azure/data-tables";

const SNAPSHOTS_TABLE = "sentimentSnapshots";
const WATCHLIST_TABLE = "sentimentWatchList";

const connectionString =
  process.env.AZURE_TABLE_CONNECTION_STRING ||
  process.env.AZURE_STORAGE_CONNECTION_STRING ||
  process.env.AzureWebJobsStorage;

if (!connectionString) {
  throw new Error(
    "Missing Azure Table Storage connection string. Set AZURE_TABLE_CONNECTION_STRING or AZURE_STORAGE_CONNECTION_STRING."
  );
}

const snapshotTableClient = TableClient.fromConnectionString(connectionString, SNAPSHOTS_TABLE);
const watchListTableClient = TableClient.fromConnectionString(connectionString, WATCHLIST_TABLE);

let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) {
    return;
  }

  await Promise.all([
    snapshotTableClient.createTable().catch((err) => {
      if (err?.statusCode !== 409) {
        throw err;
      }
    }),
    watchListTableClient.createTable().catch((err) => {
      if (err?.statusCode !== 409) {
        throw err;
      }
    }),
  ]);

  tablesInitialized = true;
}

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase();
}

function flattenNotablePosts(notablePosts = []) {
  const flattened = {};

  if (!Array.isArray(notablePosts)) {
    return flattened;
  }

  notablePosts.forEach((post, index) => {
    if (!post || typeof post !== "object") {
      return;
    }

    const prefix = `notablePost${index + 1}`;
    Object.entries(post).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      const fieldName = `${prefix}_${key}`;
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        flattened[fieldName] = value;
      } else {
        flattened[fieldName] = JSON.stringify(value);
      }
    });
  });

  return flattened;
}

function parseDrivers(snapshot) {
  const parsed = { ...snapshot };

  Object.keys(parsed).forEach((key) => {
    if (!key.toLowerCase().includes("driver")) {
      return;
    }

    const value = parsed[key];
    if (typeof value !== "string") {
      return;
    }

    try {
      parsed[key] = JSON.parse(value);
    } catch {
      // Keep original string if it is not JSON.
    }
  });

  return parsed;
}

export async function persistSnapshot(payload = {}) {
  await ensureTables();

  const ticker = normalizeTicker(payload.ticker || payload.symbol);
  if (!ticker) {
    throw new Error("persistSnapshot requires payload.ticker or payload.symbol");
  }

  const timestamp = payload.timestamp || payload.capturedAt || new Date().toISOString();
  const rowKey = new Date(timestamp).toISOString();

  const entity = {
    PartitionKey: ticker,
    RowKey: rowKey,
    ticker,
    timestamp: rowKey,
  };

  Object.entries(payload).forEach(([key, value]) => {
    if (["PartitionKey", "RowKey", "notablePosts", "symbol"].includes(key) || value === undefined) {
      return;
    }

    if (key.toLowerCase().includes("driver") && typeof value === "object" && value !== null) {
      entity[key] = JSON.stringify(value);
      return;
    }

    entity[key] = value;
  });

  Object.assign(entity, flattenNotablePosts(payload.notablePosts));

  await snapshotTableClient.upsertEntity(entity, "Merge");

  return entity;
}

export async function getSnapshotHistory(ticker, days = 30) {
  await ensureTables();

  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    return [];
  }

  const normalizedDays = Number.isFinite(Number(days)) ? Number(days) : 30;
  const lookbackDays = Math.max(1, normalizedDays);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const filter = `PartitionKey eq '${normalizedTicker}' and RowKey ge '${start}'`;
  const history = [];

  for await (const entity of snapshotTableClient.listEntities({ queryOptions: { filter } })) {
    history.push(parseDrivers(entity));
  }

  history.sort((a, b) => String(b.RowKey).localeCompare(String(a.RowKey)));
  return history;
}

export async function getWatchList(userId) {
  await ensureTables();

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return [];
  }

  const filter = `PartitionKey eq '${normalizedUserId}' and isActive eq true`;
  const entries = [];

  for await (const entity of watchListTableClient.listEntities({ queryOptions: { filter } })) {
    entries.push({
      userId: entity.PartitionKey,
      ticker: entity.RowKey,
      isActive: entity.isActive === true,
      updatedAt: entity.updatedAt || null,
    });
  }

  entries.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return entries;
}

export async function addToWatchList(userId, ticker) {
  await ensureTables();

  const normalizedUserId = String(userId || "").trim();
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedUserId || !normalizedTicker) {
    throw new Error("addToWatchList requires userId and ticker");
  }

  const now = new Date().toISOString();
  const entity = {
    PartitionKey: normalizedUserId,
    RowKey: normalizedTicker,
    userId: normalizedUserId,
    ticker: normalizedTicker,
    isActive: true,
    updatedAt: now,
  };

  await watchListTableClient.upsertEntity(entity, "Merge");

  return {
    userId: normalizedUserId,
    ticker: normalizedTicker,
    isActive: true,
    updatedAt: now,
  };
}

export async function removeFromWatchList(userId, ticker) {
  await ensureTables();

  const normalizedUserId = String(userId || "").trim();
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedUserId || !normalizedTicker) {
    throw new Error("removeFromWatchList requires userId and ticker");
  }

  const now = new Date().toISOString();
  const entity = {
    PartitionKey: normalizedUserId,
    RowKey: normalizedTicker,
    userId: normalizedUserId,
    ticker: normalizedTicker,
    isActive: false,
    updatedAt: now,
  };

  await watchListTableClient.upsertEntity(entity, "Merge");

  return {
    userId: normalizedUserId,
    ticker: normalizedTicker,
    isActive: false,
    updatedAt: now,
  };
}
