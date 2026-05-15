import 'dotenv/config';
import { TableClient } from "@azure/data-tables";

const SNAPSHOTS_TABLE = "sentimentSnapshots";
const WATCHLIST_TABLE = "sentimentWatchList";

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ESOCKETTIMEDOUT",
  "ETIMEDOUT",
  "REQUEST_SEND_ERROR",
]);

let snapshotTableClient;
let watchListTableClient;

let tablesInitialized = false;

function getConnectionString({ requireAzureStorage = false } = {}) {
  const azureStorageConnectionString = String(process.env.AZURE_STORAGE_CONNECTION_STRING || "").trim();

  if (requireAzureStorage && !azureStorageConnectionString) {
    throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
  }

  return (
    azureStorageConnectionString ||
    process.env.AZURE_TABLE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    ""
  );
}

function getSnapshotTableClient() {
  if (!snapshotTableClient) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        "Missing Azure Table Storage connection string. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_TABLE_CONNECTION_STRING."
      );
    }

    snapshotTableClient = TableClient.fromConnectionString(connectionString, SNAPSHOTS_TABLE);
  }

  return snapshotTableClient;
}

function getWatchListTableClient({ requireAzureStorage = false } = {}) {
  if (requireAzureStorage) {
    getConnectionString({ requireAzureStorage: true });
  }

  if (!watchListTableClient) {
    const connectionString = getConnectionString({ requireAzureStorage });
    if (!connectionString) {
      throw new Error(
        "Missing Azure Table Storage connection string. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_TABLE_CONNECTION_STRING."
      );
    }

    watchListTableClient = TableClient.fromConnectionString(connectionString, WATCHLIST_TABLE);
  }

  return watchListTableClient;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientWriteError(err) {
  const errorCode = String(err?.code || err?.name || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  const statusCode = Number(err?.statusCode || err?.status || 0);

  return (
    TRANSIENT_ERROR_CODES.has(errorCode) ||
    statusCode >= 500 ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("temporarily unavailable")
  );
}

function getUserContext(user) {
  if (typeof user === "string") {
    return {
      id: String(user || "").trim() || null,
      tenantId: null,
    };
  }

  return {
    id: String(user?.id || "").trim() || null,
    tenantId: String(user?.tenantId || "").trim() || null,
  };
}

async function ensureTables(options = {}) {
  if (tablesInitialized) {
    return;
  }

  await Promise.all([
    getSnapshotTableClient().createTable().catch((err) => {
      if (err?.statusCode !== 409) {
        throw err;
      }
    }),
    getWatchListTableClient(options).createTable().catch((err) => {
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
    partitionKey: ticker,
    rowKey,
    ticker,
    timestamp: rowKey,
  };

  Object.entries(payload).forEach(([key, value]) => {
    if (["partitionKey", "rowKey", "PartitionKey", "RowKey", "notablePosts", "symbol", "topPositivePosts", "topNegativePosts"].includes(key) || value === undefined) {
      return;
    }

    if (["positiveDrivers", "negativeDrivers"].includes(key) && Array.isArray(value)) {
      entity[key] = JSON.stringify(value);
      return;
    }

    if (typeof value === "object" && value !== null) {
      entity[key] = JSON.stringify(value);
      return;
    }

    entity[key] = value;
  });

  Object.assign(entity, flattenNotablePosts(payload.notablePosts));

  await getSnapshotTableClient().upsertEntity(entity, "Merge");

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

  for await (const entity of getSnapshotTableClient().listEntities({ queryOptions: { filter } })) {
    history.push(parseDrivers(entity));
  }

  history.sort((a, b) => String(b.RowKey).localeCompare(String(a.RowKey)));
  return history;
}

export async function getLatestSnapshot(ticker) {
  const history = await getSnapshotHistory(ticker, 7);
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }
  return history[history.length - 1];
}

export async function getWatchList(userId) {
  await ensureTables();

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return [];
  }

  const filter = `PartitionKey eq '${normalizedUserId}' and isActive eq true`;
  const entries = [];

  for await (const entity of getWatchListTableClient().listEntities({ queryOptions: { filter } })) {
    entries.push({
      userId: entity.partitionKey || entity.PartitionKey,
      ticker: entity.rowKey || entity.RowKey,
      isActive: entity.isActive === true,
      updatedAt: entity.updatedAt || null,
    });
  }

  entries.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return entries;
}

export async function addToWatchList(userId, ticker) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedUserId || !normalizedTicker) {
    throw new Error("addToWatchList requires userId and ticker");
  }

  await ensureTables({ requireAzureStorage: true });

  const now = new Date().toISOString();
  const entity = {
    partitionKey: normalizedUserId,
    rowKey: normalizedTicker,
    userId: normalizedUserId,
    ticker: normalizedTicker,
    isActive: true,
    updatedAt: now,
  };

  const retryDelaysMs = [200, 600];
  let attempt = 0;

  while (true) {
    try {
      await getWatchListTableClient({ requireAzureStorage: true }).upsertEntity(entity, "Merge");

      return {
        userId: normalizedUserId,
        ticker: normalizedTicker,
        isActive: true,
        updatedAt: now,
      };
    } catch (err) {
      const shouldRetry = attempt < 1 && isTransientWriteError(err);

      if (shouldRetry) {
        const delayMs = retryDelaysMs[attempt];
        console.warn("[DB] addToWatchlist retry", {
          symbol: normalizedTicker,
          attempt: attempt + 2,
          delayMs,
          message: err?.message,
        });
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      console.error('[DB ERROR] addToWatchlist', {
        symbol: normalizedTicker,
        message: err?.message,
        stack: err?.stack,
      });
      throw err;
    }
  }
}

export async function addToWatchlist(symbol, user) {
  const normalizedTicker = normalizeTicker(symbol);
  const userContext = getUserContext(user);

  console.log("[DB] addToWatchlist", {
    symbol: normalizedTicker,
    user: userContext,
  });

  if (!String(process.env.AZURE_STORAGE_CONNECTION_STRING || "").trim()) {
    const err = new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
    console.error('[DB ERROR] addToWatchlist', {
      symbol: normalizedTicker,
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }

  if (!normalizedTicker) {
    const err = new Error("addToWatchlist requires symbol");
    console.error('[DB ERROR] addToWatchlist', {
      symbol: normalizedTicker,
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }

  if (!userContext.id) {
    const err = new Error("addToWatchlist requires user.id");
    console.error('[DB ERROR] addToWatchlist', {
      symbol: normalizedTicker,
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }

  try {
    const savedEntity = await addToWatchList(userContext.id, normalizedTicker);
    console.log("[DB] addToWatchlist success", {
      symbol: normalizedTicker,
    });
    return savedEntity;
  } catch (err) {
    console.error('[DB ERROR] addToWatchlist', {
      symbol: normalizedTicker,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

export async function removeFromWatchList(userId, ticker) {
  await ensureTables();

  const normalizedUserId = String(userId || "").trim();
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedUserId || !normalizedTicker) {
    throw new Error("removeFromWatchList requires userId and ticker");
  }

  try {
    await getWatchListTableClient().deleteEntity(normalizedUserId, normalizedTicker);
    return {
      userId: normalizedUserId,
      ticker: normalizedTicker,
      deleted: true,
    };
  } catch (err) {
    if (Number(err?.statusCode || err?.status) === 404) {
      const notFoundError = new Error(`Watchlist symbol not found: ${normalizedTicker}`);
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    console.error("[DB ERROR] removeFromWatchList", {
      userId: normalizedUserId,
      symbol: normalizedTicker,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}
