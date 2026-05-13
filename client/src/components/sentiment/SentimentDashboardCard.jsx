import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SentimentGauge from "./SentimentGauge";
import SentimentRow from "./SentimentRow";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import useSentimentHistory from "../../hooks/useSentimentHistory";
import { getSentimentWatchlist } from "../../services/sentimentApi";

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function useDashboardWatchlist() {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isStale = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await getSentimentWatchlist();

        const nextSymbols = Array.isArray(response?.watchlist)
          ? response.watchlist
              .map((entry) => normalizeTicker(entry?.ticker || entry?.symbol || entry?.rowKey))
              .filter(Boolean)
          : [];

        if (!isStale) {
          setSymbols(nextSymbols);
        }
      } catch (err) {
        if (!isStale) {
          setSymbols([]);
          setError(err?.message || "Failed to load watchlist");
        }
      } finally {
        if (!isStale) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isStale = true;
    };
  }, []);

  return { symbols, loading, error };
}

const RUN_SCHEDULE_MINUTES = [9 * 60 + 15, 13 * 60, 16 * 60 + 10];

function getEtParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function getEtOffsetMinutes(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });

  const tzPart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName");
  const value = tzPart?.value || "GMT-5";
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) {
    return -300;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function etDateToUtcMs(year, month, day, hour, minute) {
  const sample = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getEtOffsetMinutes(sample);
  return Date.UTC(year, month - 1, day, hour, minute) - offset * 60 * 1000;
}

function getMostRecentScheduledRunUtc(now = new Date()) {
  const et = getEtParts(now);
  const currentMinutes = et.hour * 60 + et.minute;

  let runDay = { year: et.year, month: et.month, day: et.day };
  let runMinutes = RUN_SCHEDULE_MINUTES[0];

  for (const schedule of RUN_SCHEDULE_MINUTES) {
    if (schedule <= currentMinutes) {
      runMinutes = schedule;
    }
  }

  if (currentMinutes < RUN_SCHEDULE_MINUTES[0]) {
    const previous = new Date(Date.UTC(et.year, et.month - 1, et.day - 1));
    runDay = {
      year: previous.getUTCFullYear(),
      month: previous.getUTCMonth() + 1,
      day: previous.getUTCDate(),
    };
    runMinutes = RUN_SCHEDULE_MINUTES[RUN_SCHEDULE_MINUTES.length - 1];
  }

  const hours = Math.floor(runMinutes / 60);
  const minutes = runMinutes % 60;
  return etDateToUtcMs(runDay.year, runDay.month, runDay.day, hours, minutes);
}

function isSnapshotStale(snapshot) {
  if (!snapshot?.timestamp) {
    return true;
  }

  const snapshotMs = new Date(snapshot.timestamp).getTime();
  if (Number.isNaN(snapshotMs)) {
    return true;
  }

  return snapshotMs < getMostRecentScheduledRunUtc();
}

export default function SentimentDashboardCard() {
  const { symbols, loading: watchlistLoading, error: watchlistError } = useDashboardWatchlist();
  const [selectedSymbol, setSelectedSymbol] = useState("");

  useEffect(() => {
    if (!symbols.length) {
      setSelectedSymbol("");
      return;
    }

    if (!selectedSymbol || !symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  const { data: selectedSnapshot, loading: latestLoading, error: latestError } = useLatestSentiment(selectedSymbol);
  useSentimentHistory(selectedSymbol, 30);

  const stale = useMemo(() => isSnapshotStale(selectedSnapshot), [selectedSnapshot]);

  if (watchlistLoading) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Sentiment</h3>
        <p className="empty">Loading watchlist sentiment...</p>
      </div>
    );
  }

  if (watchlistError) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Sentiment</h3>
        <p className="empty">{watchlistError}</p>
      </div>
    );
  }

  if (!symbols.length) {
    return (
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Sentiment</h3>
          <span
            title="Sentiment updates 3× daily at 9:15 AM, 1:00 PM, and 4:10 PM ET."
            style={{ color: "#94a3b8", cursor: "help", fontSize: 13 }}
          >
            ⓘ
          </span>
        </div>
        <div style={{ marginTop: 18, color: "#94a3b8", fontSize: 14 }}>
          No watchlist symbols yet. Add symbols in Research to start tracking sentiment.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Sentiment</h3>
        <span
          title="Sentiment updates 3× daily at 9:15 AM, 1:00 PM, and 4:10 PM ET."
          style={{ color: "#94a3b8", cursor: "help", fontSize: 13 }}
        >
          ⓘ
        </span>
      </div>

      <SentimentGauge
        ticker={selectedSymbol}
        snapshot={selectedSnapshot}
        loading={latestLoading}
        error={latestError}
        isStale={stale}
      />

      <div style={{ marginTop: 4 }}>
        {symbols.map((symbol) => (
          <SentimentRow
            key={symbol}
            symbol={symbol}
            selected={symbol === selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        ))}
      </div>

      <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
        <Link
          to={`/research?symbol=${encodeURIComponent(selectedSymbol || symbols[0] || "AAPL")}`}
          style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
        >
          Research {selectedSymbol || symbols[0] || "AAPL"} →
        </Link>
      </div>
    </div>
  );
}
