import { useState } from "react";
import useSymbolSearch from "../hooks/useSymbolSearch";
import { useEffect } from "react";
import useToast from "../hooks/useToast";
import { addToWatchlist, getWatchlist } from "../services/watchlistApi";


export default function QuickActions({ onSymbolSelected }) {
  const [input, setInput] = useState("");
  const { loading, error, result, searchSymbol } = useSymbolSearch();
  const [fundamentals, setFundamentals] = useState(null);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

   useEffect(() => {
    if (result && onSymbolSelected) {
      onSymbolSelected(result.symbol);
    }
  }, [result, onSymbolSelected]);

  // ───────────────────────────────────────────────
  // FETCH FUNDAMENTALS
  // ───────────────────────────────────────────────
  const fetchFundamentals = async () => {
    const symbol = input.trim();
    if (!symbol) return;

    try {
      const r = await fetch(`/api/fundamentals/${symbol}`);
      const data = await r.json();
      setFundamentals(data);
    } catch (err) {
      console.error("Fundamentals error:", err);
    }
  };

  const handleSearch = () => {
    const trimmed = input.trim();
    if (trimmed) searchSymbol(trimmed);
  };

  async function handleAddToWatchlist() {
    const symbol = input.trim();
    if (!symbol) return;
    try {
      setAdding(true);
      await addToWatchlist(symbol);
      const watchlist = await getWatchlist();
      window.dispatchEvent(new CustomEvent("watchlist:updated", { detail: { watchlist } }));
      toast.success(`${symbol} added to watchlist`);
    } catch (err) {
      console.error("Watchlist error:", err);
      toast.error("Failed to add to watchlist");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      {/* ─────────────────────────────────────────────── */}
      {/* QUICK ACTIONS CARD */}
      {/* ─────────────────────────────────────────────── */}
      <div className="card quick-actions-card">
        <h3>Quick Actions</h3>

        {/* Search Bar */}
        <div className="quick-actions-search">
          <input
            type="text"
            placeholder="Search symbol…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="quick-actions-input"
          />
          <button className="btn icon-btn" onClick={handleSearch}>
            Search
          </button>
        </div>

        {/* Quick View */}
        <div className="quick-view">
          {loading && <p>Searching…</p>}
          {error && <p className="error">{error}</p>}

          {result && (
            <div className="quick-view-box">
              <div className="qv-row">
                <span className="qv-symbol">{result.symbol}</span>
                {result.name && <span className="qv-name">{result.name}</span>}
              </div>

              <div className="qv-row">
                <span>Bid:</span>
                <span>
                  {result.bid != null ? `$${result.bid.toFixed(2)}` : "—"}
                </span>
              </div>

              <div className="qv-row">
                <span>Ask:</span>
                <span>
                  {result.ask != null ? `$${result.ask.toFixed(2)}` : "—"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="quick-actions-buttons">
          <button className="btn buy-btn">Buy</button>
          <button className="btn sell-btn">Sell</button>
          <button className="btn close-position-btn">Close Position</button>

          {/* FIXED: use fetchFundamentals() with no symbol param */}
          <button className="btn qa-button" onClick={fetchFundamentals}>
            Fundamentals
          </button>

          <button className="btn" onClick={handleSearch}>
            Refresh
          </button>

          <button
            type="button"
            className="qa-btn qa-btn--watchlist"
            onClick={handleAddToWatchlist}
            disabled={!input.trim() || adding}
          >
            {adding ? "Adding..." : "Add to Watchlist"}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────── */}
      {/* FUNDAMENTALS CARD (SEPARATE CARD BELOW) */}
      {/* ─────────────────────────────────────────────── */}
      {fundamentals && <FundamentalsCard data={fundamentals} />}
    </>
  );
}

// ───────────────────────────────────────────────
// FUNDAMENTALS CARD COMPONENT
// Paste this BELOW the main component
// ───────────────────────────────────────────────
function FundamentalsCard({ data }) {
  return (
    <div className="card fundamentals-card">
      <h3>
        {data.symbol} — {data.name}
      </h3>

      <div className="fundamentals-grid">
        <div><strong>Market Cap:</strong> {Number(data.marketCap).toLocaleString()}</div>
        <div><strong>P/E Ratio:</strong> {data.peRatio}</div>
        <div><strong>EPS:</strong> {data.eps}</div>
        <div><strong>Dividend Yield:</strong> {data.dividendYield}</div>
        <div><strong>Profit Margin:</strong> {data.profitMargin}</div>
        <div><strong>Analyst Target:</strong> {data.analystTargetPrice}</div>
        <div><strong>52W High:</strong> {data.week52High}</div>
        <div><strong>52W Low:</strong> {data.week52Low}</div>
        <div><strong>Beta:</strong> {data.beta}</div>
      </div>

      <p className="description">{data.description}</p>
    </div>
  );
}
