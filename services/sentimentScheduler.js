import { TableClient } from "@azure/data-tables";
import { runSentimentPipeline } from "./sentimentService.js";

// ─── Schedule configuration ────────────────────────────────
// Three runs per weekday in US Eastern Time (UTC offsets are handled below).
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

function getEasternOffset() {
  // JavaScript Intl resolves DST automatically.
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  // Returns offset in hours (ET = UTC-4 during EDT, UTC-5 during EST).
  return (now.getTime() - etDate.getTime()) / (60 * 60 * 1000);
}

function toEasternDate(date) {
  return new Date(
    date.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
}

function isWeekday(etDate) {
  const day = etDate.getDay(); // 0 = Sunday, 6 = Saturday
  return day >= 1 && day <= 5;
}

async function fetchActiveWatchlistTickers() {
  const connectionString =
    process.env.AZURE_TABLE_CONNECTION_STRING ||
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage;

  if (!connectionString) {
    console.warn("[SCHEDULER] No Azure Table Storage connection string — skipping watchlist fetch.");
    return [];
  }

  const client = TableClient.fromConnectionString(connectionString, "sentimentWatchList");
  const tickerSet = new Set();

  for await (const entity of client.listEntities({
    queryOptions: { filter: "isActive eq true" },
  })) {
    if (entity.RowKey) {
      tickerSet.add(String(entity.RowKey).trim().toUpperCase());
    }
  }

  return [...tickerSet];
}

async function runScheduledRefresh() {
  console.log("[SCHEDULER] Starting scheduled sentiment refresh…");

  let tickers;
  try {
    tickers = await fetchActiveWatchlistTickers();
  } catch (err) {
    console.error("[SCHEDULER] Failed to fetch watchlist:", err.message);
    return;
  }

  if (!tickers.length) {
    console.log("[SCHEDULER] Watchlist is empty — nothing to refresh.");
    return;
  }

  console.log(`[SCHEDULER] Refreshing ${tickers.length} ticker(s): ${tickers.join(", ")}`);

  for (const ticker of tickers) {
    console.time(`[SCHEDULER] ${ticker}`);
    try {
      await runSentimentPipeline(ticker);
    } catch (err) {
      console.error(`[SCHEDULER] Error refreshing ${ticker}:`, err.message);
    } finally {
      console.timeEnd(`[SCHEDULER] ${ticker}`);
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
          console.error("[SCHEDULER] Unhandled refresh error:", err.message);
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