import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SentimentGauge from "./SentimentGauge";
import SentimentRow from "./SentimentRow";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import useSentimentHistory from "../../hooks/useSentimentHistory";
import useToast from "../../hooks/useToast";
import { getWatchlist } from "../../services/watchlistApi";

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function toWatchlistSymbols(entries) {
  return Array.isArray(entries)
    ? entries
        .map((entry) => normalizeTicker(entry?.ticker || entry?.symbol || entry?.rowKey))
        .filter(Boolean)
    : [];
}

function useSentimentWatchlist(refreshKey = 0) {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isStale = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const watchlist = await getWatchlist();
        const nextSymbols = toWatchlistSymbols(watchlist);

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
  }, [refreshKey]);

  return { symbols, loading, error };
}

export default function SentimentDashboardCard() {
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [watchlistRefreshKey, setWatchlistRefreshKey] = useState(0);
  const [rowsRefreshKey, setRowsRefreshKey] = useState(0);
  const [historyDays, setHistoryDays] = useState(30);
  const { symbols, loading: watchlistLoading, error: watchlistError } = useSentimentWatchlist(watchlistRefreshKey);
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
  const {
    history: selectedHistory,
    loading: historyLoading,
    error: historyError,
  } = useSentimentHistory(selectedSymbol, historyDays);

  const gaugeSnapshot = selectedHistory[0] ?? selectedSnapshot;
  const gaugeLoading = latestLoading || historyLoading;
  const gaugeError = latestError || historyError;

  const refetchAllSentiment = useCallback(async () => {
    const watchlist = await getWatchlist();
    const nextSymbols = toWatchlistSymbols(watchlist);

    // Trigger watchlist re-fetch and force row remount to refresh each row's latest sentiment.
    setWatchlistRefreshKey((value) => value + 1);
    setRowsRefreshKey((value) => value + 1);

    // Toggle history days to force selected symbol history refresh for the gauge.
    setHistoryDays((value) => (value === 30 ? 31 : 30));

    if (!nextSymbols.length) {
      setSelectedSymbol("");
      return;
    }

    setSelectedSymbol((current) => (current && nextSymbols.includes(current) ? current : nextSymbols[0]));
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await refetchAllSentiment();
      toast.success("Sentiment updated");
    } catch {
      toast.error("Failed to refresh sentiment");
    } finally {
      setRefreshing(false);
    }
  }, [refetchAllSentiment, toast]);

  useEffect(() => {
    function handleWatchlistUpdated() {
      handleRefresh();
    }

    window.addEventListener("watchlist:updated", handleWatchlistUpdated);
    return () => window.removeEventListener("watchlist:updated", handleWatchlistUpdated);
  }, [handleRefresh]);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Sentiment</h3>
        <span
          title="Sentiment updates 3× daily at 9:15 AM, 1:00 PM, and 4:10 PM ET."
          style={{ color: "#94a3b8", cursor: "help", fontSize: 13 }}
        >
          ⓘ
        </span>
        </div>
        <button
          className="sentiment-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh sentiment"
        >
          ⟳
        </button>
      </div>

      <SentimentGauge
        ticker={selectedSymbol}
        snapshot={gaugeSnapshot}
        loading={gaugeLoading}
        error={gaugeError}
      />

      <div style={{ marginTop: 4 }}>
        {symbols.map((symbol) => (
          <SentimentRow
            key={`${symbol}-${rowsRefreshKey}`}
            symbol={symbol}
            selected={symbol === selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        ))}
      </div>

      {selectedSymbol && (
        <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
          <Link
            to={`/research?symbol=${encodeURIComponent(selectedSymbol)}`}
            style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 600, fontSize: 14 }}
          >
            Research {selectedSymbol} →
          </Link>
        </div>
      )}
    </div>
  );
}
