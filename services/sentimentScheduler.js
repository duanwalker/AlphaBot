import { fetchSentimentSnapshot } from "./sentimentFetcher.js";
import * as sentimentDb from "./sentimentDb.js";

// --- Schedule configuration ------------------------------------------------
// Three runs per weekday in US Eastern Time.
// 09:15 ET, 13:00 ET, 16:10 ET
const SCHEDULE_ET_TIMES = [
  { hour: 9, minute: 15 },
  { hour: 13, minute: 0 },
  { hour: 16, minute: 10 },
];

// Poll every 60 seconds to check whether a scheduled time has been reached.
const POLL_INTERVAL_MS = 60 * 1000;

// Track which (date + slot) combinations have already fired this calendar day.
const firedSlots = new Set();

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function toEasternDate(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function isWeekday(etDate) {
  const day = etDate.getDay(); // 0 = Sunday, 6 = Saturday
  return day >= 1 && day <= 5;
}

function extractTicker(entry) {
  if (typeof entry === "string") {
    return normalizeSymbol(entry);
  }

  return normalizeSymbol(entry?.ticker || entry?.symbol || entry?.RowKey);
}

async function getWatchlistSymbols() {
  if (typeof sentimentDb.getWatchlist === "function") {
    const watchlist = await sentimentDb.getWatchlist();
    return [...new Set((watchlist || []).map(extractTicker).filter(Boolean))];
  }

  if (typeof sentimentDb.getWatchList === "function") {
    const userId = String(process.env.SENTIMENT_SCHEDULER_USER_ID || "alpha-dev").trim();
    const watchlist = await sentimentDb.getWatchList(userId);
    return [...new Set((watchlist || []).map(extractTicker).filter(Boolean))];
  }

  throw new Error("sentimentDb.getWatchlist() is not available");
}

async function saveSnapshot(symbol, snapshot) {
  if (typeof sentimentDb.saveSnapshot === "function") {
    await sentimentDb.saveSnapshot(symbol, snapshot);
    return;
  }

  if (typeof sentimentDb.persistSnapshot === "function") {
    await sentimentDb.persistSnapshot({
      ...snapshot,
      symbol,
      ticker: symbol,
    });
    return;
  }

  throw new Error("sentimentDb.saveSnapshot(symbol, snapshot) is not available");
}

async function runScheduledRefresh() {
  console.log("[SCHEDULER] Starting scheduled sentiment refresh...");

  let symbols;
  try {
    symbols = await getWatchlistSymbols();
  } catch (err) {
    console.error("[SCHEDULER] Failed to load watchlist symbols:", err?.message || err);
    return;
  }

  if (!symbols.length) {
    console.log("[SCHEDULER] Watchlist is empty, nothing to refresh.");
    return;
  }

  console.log(`[SCHEDULER] Refreshing ${symbols.length} symbol(s): ${symbols.join(", ")}`);

  for (const symbol of symbols) {
    console.time(`[SCHEDULER] ${symbol}`);
    try {
      const snapshot = await fetchSentimentSnapshot(symbol);
      await saveSnapshot(symbol, snapshot);
      console.log(`[SCHEDULER] Saved snapshot for ${symbol} (${snapshot.sampleSize} samples).`);
    } catch (err) {
      console.error(`[SCHEDULER] Failed ${symbol}:`, err?.message || err);
    } finally {
      console.timeEnd(`[SCHEDULER] ${symbol}`);
    }
  }

  console.log("[SCHEDULER] Scheduled sentiment refresh complete.");
}

export function startSentimentScheduler() {
  console.log("[SCHEDULER] Sentiment scheduler started. Polling every 60 s for ET schedule.");

  setInterval(() => {
    const now = new Date();
    const etNow = toEasternDate(now);

    if (!isWeekday(etNow)) {
      return;
    }

    const etHour = etNow.getHours();
    const etMinute = etNow.getMinutes();
    const etDateStr = etNow.toISOString().slice(0, 10);

    for (const slot of SCHEDULE_ET_TIMES) {
      const slotKey = `${etDateStr}|${slot.hour}:${slot.minute}`;

      if (etHour === slot.hour && etMinute === slot.minute && !firedSlots.has(slotKey)) {
        firedSlots.add(slotKey);
        runScheduledRefresh().catch((err) => {
          console.error("[SCHEDULER] Unhandled refresh error:", err?.message || err);
        });
        break;
      }
    }

    // Prune slots from previous calendar days to prevent unbounded growth.
    for (const key of firedSlots) {
      if (!key.startsWith(etDateStr)) {
        firedSlots.delete(key);
      }
    }
  }, POLL_INTERVAL_MS);
}
