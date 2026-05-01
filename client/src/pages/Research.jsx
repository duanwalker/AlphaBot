import { useEffect, useState } from "react";
import {
  addSentimentWatchlistSymbol,
  getSentimentHistory,
  getSentimentWatchlist,
  removeSentimentWatchlistSymbol,
} from "../services/sentimentApi";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

export default function Research() {
  const [watchlist, setWatchlist] = useState([]);
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newSymbol, setNewSymbol] = useState("");

  async function loadWatchlist() {
    const data = await getSentimentWatchlist();
    const symbols = Array.isArray(data?.watchlist)
      ? data.watchlist.map((entry) => normalizeSymbol(entry.symbol)).filter(Boolean)
      : [];
    setWatchlist(symbols);
    return symbols;
  }

  async function loadHistory(selectedSymbol, selectedDays) {
    const normalized = normalizeSymbol(selectedSymbol);
    if (!normalized) return;

    setLoading(true);
    setError("");
    try {
      const data = await getSentimentHistory(normalized, selectedDays);
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } catch (err) {
      setError(err.message || "Failed to load sentiment history");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const initialDays = 30;

    async function bootstrap() {
      try {
        const symbols = await loadWatchlist();
        const initial = symbols[0] || "AAPL";
        if (!mounted) return;
        setSymbol(initial);
        await loadHistory(initial, initialDays);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Failed to initialize sentiment research");
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  async function addSymbol() {
    const normalized = normalizeSymbol(newSymbol);
    if (!normalized) return;

    setError("");
    try {
      await addSentimentWatchlistSymbol(normalized);
      setNewSymbol("");
      const symbols = await loadWatchlist();
      if (symbols.includes(normalized)) {
        setSymbol(normalized);
        await loadHistory(normalized, days);
      }
    } catch (err) {
      setError(err.message || "Failed to add watchlist symbol");
    }
  }

  async function removeSymbol(targetSymbol) {
    setError("");
    try {
      await removeSentimentWatchlistSymbol(targetSymbol);
      const symbols = await loadWatchlist();
      if (targetSymbol === symbol) {
        const next = symbols[0] || "AAPL";
        setSymbol(next);
        await loadHistory(next, days);
      }
    } catch (err) {
      setError(err.message || "Failed to remove watchlist symbol");
    }
  }

  async function handleLoad() {
    await loadHistory(symbol, days);
  }

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Research</h1>
        <p className="page-subtitle">Sentiment history and watchlist tracking.</p>
      </header>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">
          <span className="card-title">Sentiment Watchlist</span>
        </div>

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

        {watchlist.length > 0 ? (
          <div className="tag-row">
            {watchlist.map((item) => (
              <span
                key={item}
                className={`tag ${symbol === item ? "tag-add" : "tag-removable"}`}
                onClick={() => setSymbol(item)}
              >
                {item}
                <button
                  type="button"
                  className="link-btn small"
                  style={{ marginLeft: 6 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSymbol(item);
                  }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="empty">No watchlist symbols yet.</p>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <span className="card-title">Sentiment History</span>
        </div>

        <div className="input-row" style={{ marginBottom: 10 }}>
          <input
            className="text-input"
            value={symbol}
            onChange={(e) => setSymbol(normalizeSymbol(e.target.value))}
            placeholder="Symbol"
          />
          <input
            className="text-input"
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            placeholder="Days"
          />
          <button className="btn btn-primary" onClick={handleLoad} disabled={loading}>
            {loading ? "Loading..." : "Load"}
          </button>
        </div>

        {error && <p className="empty">{error}</p>}
        {!error && history.length === 0 && !loading && <p className="empty">No sentiment history available.</p>}

        {history.length > 0 && (
          <div>
            {history.map((entry, index) => (
              <div key={`${entry.asOf || index}-${index}`} className="holding-row">
                <span className="holding-ticker">{entry.asOf || "n/a"}</span>
                <span className="holding-pnl">Score: {Number(entry.sentimentScore || 0).toFixed(2)}</span>
                <span className="holding-pnl">Bull/Bear: {Number(entry.bullBearRatio || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
