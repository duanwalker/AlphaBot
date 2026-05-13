import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SentimentGauge from "./SentimentGauge";
import SentimentRow from "./SentimentRow";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import { getSentimentWatchlist } from "../../services/sentimentApi";

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function useSentimentWatchlist() {
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

export default function SentimentDashboardCard() {
  const { symbols, loading: watchlistLoading, error: watchlistError } = useSentimentWatchlist();
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
