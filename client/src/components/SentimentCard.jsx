import { useEffect, useMemo, useState } from "react";
import {
  addSentimentWatchlistSymbol,
  getSentimentSnapshot,
  getSentimentWatchlist,
  removeSentimentWatchlistSymbol,
} from "../services/sentimentApi";

function scoreLabel(score) {
  if (score >= 0.67) return "Bullish";
  if (score <= 0.33) return "Bearish";
  return "Neutral";
}

export default function SentimentCard() {
  const [watchlist, setWatchlist] = useState([]);
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newSymbol, setNewSymbol] = useState("");

  async function loadWatchlist() {
    const data = await getSentimentWatchlist();
    const symbols = Array.isArray(data?.watchlist)
      ? data.watchlist.map((entry) => String(entry.symbol || "").toUpperCase()).filter(Boolean)
      : [];
    setWatchlist(symbols);
    return symbols;
  }

  async function loadSnapshot(symbol) {
    const data = await getSentimentSnapshot(symbol);
    setSnapshot(data?.snapshot || null);
  }

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      setLoading(true);
      setError("");
      try {
        const symbols = await loadWatchlist();
        const symbolToLoad = symbols[0] || "AAPL";
        if (!mounted) return;
        setActiveSymbol(symbolToLoad);
        await loadSnapshot(symbolToLoad);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Failed to load sentiment");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  async function selectSymbol(symbol) {
    setActiveSymbol(symbol);
    setLoading(true);
    setError("");
    try {
      await loadSnapshot(symbol);
    } catch (err) {
      setError(err.message || "Failed to load sentiment");
    } finally {
      setLoading(false);
    }
  }

  async function addSymbol() {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;

    setError("");
    try {
      await addSentimentWatchlistSymbol(symbol);
      setNewSymbol("");
      const symbols = await loadWatchlist();
      if (symbols.includes(symbol)) {
        await selectSymbol(symbol);
      }
    } catch (err) {
      setError(err.message || "Failed to add symbol");
    }
  }

  async function removeSymbol(symbol) {
    setError("");
    try {
      await removeSentimentWatchlistSymbol(symbol);
      const symbols = await loadWatchlist();

      if (symbol === activeSymbol) {
        const nextSymbol = symbols[0] || "AAPL";
        await selectSymbol(nextSymbol);
      }
    } catch (err) {
      setError(err.message || "Failed to remove symbol");
    }
  }

  const score = Number(snapshot?.sentimentScore || 0);
  const label = useMemo(() => scoreLabel(score), [score]);

  return (
    <div className="card">
      <h3>Sentiment Analysis</h3>

      <div className="input-row" style={{ marginBottom: 8 }}>
        <input
          className="text-input"
          placeholder="Add symbol"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSymbol()}
        />
        <button className="btn" onClick={addSymbol}>Add</button>
      </div>

      {watchlist.length > 0 && (
        <div className="tag-row" style={{ marginBottom: 10 }}>
          {watchlist.map((symbol) => (
            <span
              key={symbol}
              className={`tag ${symbol === activeSymbol ? "tag-add" : "tag-removable"}`}
              onClick={() => selectSymbol(symbol)}
              title="Click to load"
            >
              {symbol}
              <button
                type="button"
                className="link-btn small"
                style={{ marginLeft: 6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSymbol(symbol);
                }}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {loading && <p className="empty">Loading sentiment...</p>}
      {!loading && error && <p className="empty">{error}</p>}

      {!loading && !error && snapshot && (
        <div>
          <p style={{ marginBottom: 4 }}>
            <strong>{activeSymbol}</strong> {label} ({(score * 100).toFixed(0)}%)
          </p>
          <p className="empty" style={{ marginBottom: 4 }}>
            Bull/Bear ratio: {Number(snapshot?.bullBearRatio || 0).toFixed(2)}
          </p>
          {snapshot?.summary && <p className="empty">{snapshot.summary}</p>}
        </div>
      )}
    </div>
  );
}
