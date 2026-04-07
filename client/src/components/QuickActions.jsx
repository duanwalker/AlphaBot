import { useState } from "react";
import useSymbolSearch from "../hooks/useSymbolSearch";

export default function QuickActions() {
  const [input, setInput] = useState("");
  const { loading, error, result, searchSymbol } = useSymbolSearch();

  const handleSearch = () => {
    const trimmed = input.trim();
    if (trimmed) searchSymbol(trimmed);
  };

  return (
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
        <button className="btn" onClick={handleSearch}>
          Refresh
        </button>
      </div>
    </div>
  );
}
