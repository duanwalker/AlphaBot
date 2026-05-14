import React, { useEffect, useMemo, useState } from "react";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import useSentimentHistory from "../../hooks/useSentimentHistory";
import {
  addSentimentWatchlistSymbol,
  getSentimentWatchlist,
} from "../../services/sentimentApi";
import { isSnapshotStale } from "../../utils/sentimentSchedule";
import ResearchSentimentChart from "./ResearchSentimentChart";
import SentimentBadge from "./SentimentBadge";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function readSymbol(entry) {
  return normalizeSymbol(entry?.symbol || entry?.ticker || entry?.rowKey);
}

function toDisplayScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= -1 && numeric <= 1) {
    return (numeric + 1) * 50;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric * 100;
  }

  return numeric;
}

function toHistoryScore(entry) {
  const numeric = Number(entry?.averageScore ?? entry?.sentimentScore ?? entry?.score ?? entry?.value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= -1 && numeric <= 1) {
    return (numeric + 1) * 50;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric * 100;
  }

  return numeric;
}

function toTimestamp(entry) {
  const candidate = entry?.timestamp || entry?.asOf || entry?.date;
  const ms = new Date(candidate).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function summarizeTrend(history) {
  const normalized = history
    .map((entry) => ({ t: toTimestamp(entry), score: toHistoryScore(entry) }))
    .filter((entry) => Number.isFinite(entry.t) && Number.isFinite(entry.score))
    .sort((a, b) => a.t - b.t);

  if (!normalized.length) {
    return {
      sevenDayChange: null,
      thirtyDayChange: null,
      high: null,
      low: null,
    };
  }

  const latest = normalized[normalized.length - 1].score;
  const sevenStart = normalized[Math.max(0, normalized.length - 7)].score;
  const thirtyStart = normalized[0].score;
  const scores = normalized.map((entry) => entry.score);

  return {
    sevenDayChange: latest - sevenStart,
    thirtyDayChange: latest - thirtyStart,
    high: Math.max(...scores),
    low: Math.min(...scores),
  };
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "n/a";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDelta(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function useWatchlist() {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshWatchlist() {
    const response = await getSentimentWatchlist();
    const next = Array.isArray(response?.watchlist)
      ? response.watchlist.map(readSymbol).filter(Boolean)
      : [];
    setSymbols(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await getSentimentWatchlist();
        if (cancelled) {
          return;
        }

        const next = Array.isArray(response?.watchlist)
          ? response.watchlist.map(readSymbol).filter(Boolean)
          : [];
        setSymbols(next);
      } catch (err) {
        if (!cancelled) {
          setSymbols([]);
          setError(err?.message || "Failed to load watchlist");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function addToWatchlist(symbol) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      await addSentimentWatchlistSymbol(normalized);
      await refreshWatchlist();
    } catch (err) {
      setError(err?.message || "Unable to add symbol to watchlist");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return { symbols, loading, error, saving, addToWatchlist };
}

function SkeletonBlock({ height = 18, width = "100%" }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: 8,
        background: "rgba(148,163,184,0.16)",
        animation: "pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export default function ResearchSentimentPanel({ symbol }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const { data: latest, loading: latestLoading, error: latestError } = useLatestSentiment(normalizedSymbol);
  const { history, loading: historyLoading, error: historyError } = useSentimentHistory(normalizedSymbol, 30);
  const { symbols, loading: watchlistLoading, error: watchlistError, saving, addToWatchlist } = useWatchlist();

  const stale = useMemo(() => isSnapshotStale(latest), [latest]);
  const summary = useMemo(() => summarizeTrend(history), [history]);
  const displayScore = useMemo(() => toDisplayScore(latest?.averageScore), [latest]);
  const inWatchlist = useMemo(() => symbols.includes(normalizedSymbol), [symbols, normalizedSymbol]);

  const isLoading = latestLoading || historyLoading;
  const combinedError = latestError || historyError || watchlistError;

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Symbol</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{normalizedSymbol || "AAPL"}</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Last updated</div>
          <div style={{ fontSize: 13, color: "#e2e8f0" }}>{formatTimestamp(latest?.timestamp)}</div>
          {stale && (
            <div
              title="Sentiment updates 3× daily at 9:15 AM, 1:00 PM, and 4:10 PM ET."
              style={{ marginTop: 4, color: "#fbbf24", fontSize: 12, fontWeight: 700 }}
            >
              ⚠ Stale
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        {latestLoading ? <SkeletonBlock height={34} width={220} /> : <SentimentBadge score={displayScore} />}
      </div>

      {combinedError && !isLoading && <p className="empty">{combinedError}</p>}

      {!combinedError && (
        <div style={{ marginBottom: 12 }}>
          <ResearchSentimentChart symbol={normalizedSymbol} />
        </div>
      )}

      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Trend Summary</div>

        {historyLoading ? (
          <div style={{ display: "grid", gap: 8 }}>
            <SkeletonBlock />
            <SkeletonBlock />
            <SkeletonBlock />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Past 7 days</span>
              <span>{formatDelta(summary.sevenDayChange)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Past 30 days</span>
              <span>{formatDelta(summary.thirtyDayChange)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>30-day high / low</span>
              <span>
                {Number.isFinite(summary.high) ? summary.high.toFixed(1) : "--"}
                {" / "}
                {Number.isFinite(summary.low) ? summary.low.toFixed(1) : "--"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        {watchlistLoading ? (
          <SkeletonBlock height={36} width={170} />
        ) : inWatchlist ? (
          <button className="btn" disabled style={{ opacity: 0.85 }}>
            ✓ Tracking
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => addToWatchlist(normalizedSymbol)}
            disabled={!normalizedSymbol || saving}
          >
            {saving ? "Adding..." : "+ Add to Watchlist"}
          </button>
        )}
      </div>
    </section>
  );
}
