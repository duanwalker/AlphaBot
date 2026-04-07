// src/components/Signals.js
import React, { useState } from "react";
import { aiChat } from "../services/api";

const ASSET_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL",
  "EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY",
  "SPY", "QQQ",
];

function parseSignals(text) {
  // Try to extract structured signals from AI text output
  const lines = text.split("\n").filter(Boolean);
  return lines.slice(0, 6).map((line, i) => {
    const isBuy = /buy|long|call/i.test(line);
    const isSell = /sell|short|put|trim|close/i.test(line);
    const isWatch = /watch|monitor|neutral/i.test(line);
    const type = isSell ? "SELL" : isWatch ? "WATCH" : "BUY";
    return { id: i, type, text: line.replace(/^[-*•\d.]\s*/, "") };
  });
}

export default function Signals({ onAddTrade }) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState(["AAPL", "MSFT", "NVDA", "EUR/USD", "SPY"]);
  const [customTicker, setCustomTicker] = useState("");

  async function generateSignals() {
    setLoading(true);
    const assets = watchlist.join(", ");
    try {
      const res = await aiChat(
        `Generate 5–6 specific trading signals for these assets: ${assets}. For each signal include: 1) ticker/pair, 2) direction (BUY/SELL/WATCH/TRIM), 3) entry level or current price context, 4) brief 1-sentence rationale, 5) price target or stop. Each signal on its own line starting with the ticker. Today's date context: early 2025.`,
        "You are a quantitative trading analyst. Generate realistic, specific, actionable trading signals with exact price levels. Each signal must be on a single line. Format: TICKER — DIRECTION: rationale. Target: $X. Stop: $Y."
      );
      setSignals(parseSignals(res.content));
    } catch (e) {
      setSignals([{ id: 0, type: "WATCH", text: `Error: ${e.message}. Check your Anthropic API key.` }]);
    }
    setLoading(false);
  }

  function addToWatchlist(ticker) {
    const t = ticker.trim().toUpperCase();
    if (t && !watchlist.includes(t)) setWatchlist([...watchlist, t]);
    setCustomTicker("");
  }

  function removeTicker(t) {
    setWatchlist(watchlist.filter((w) => w !== t));
  }

  function createTradeFromSignal(signal) {
    onAddTrade({
      id: Date.now(),
      ticker: signal.text.split(/[\s—–]/)[0].toUpperCase(),
      type: signal.type === "SELL" ? "SELL" : "BUY",
      assetClass: "equity",
      shares: 10,
      estimatedPrice: 0,
      stopLoss: null,
      rationale: signal.text,
      confidence: Math.floor(60 + Math.random() * 25),
      status: "pending",
    });
    alert("Trade idea added to Pending Trades tab.");
  }

  const badgeClass = (type) =>
    type === "BUY" ? "badge-buy" : type === "SELL" ? "badge-sell" : "badge-watch";

  return (
    <div className="tab-content">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">
          <span className="card-title">Watchlist</span>
          <span className="card-subtitle">assets to scan</span>
        </div>
        <div className="tag-row">
          {watchlist.map((t) => (
            <span key={t} className="tag tag-removable" onClick={() => removeTicker(t)}>
              {t} ×
            </span>
          ))}
        </div>
        <div className="input-row" style={{ marginTop: 10 }}>
          <input
            className="text-input"
            placeholder="Add ticker or pair (e.g. TSLA, USD/JPY)..."
            value={customTicker}
            onChange={(e) => setCustomTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addToWatchlist(customTicker)}
          />
          <button className="btn" onClick={() => addToWatchlist(customTicker)}>Add</button>
          <button className="btn btn-primary" onClick={generateSignals} disabled={loading}>
            {loading ? "Scanning market..." : "Generate signals ↗"}
          </button>
        </div>
        <div className="quick-adds" style={{ marginTop: 8 }}>
          {ASSET_UNIVERSE.filter((a) => !watchlist.includes(a)).map((a) => (
            <span key={a} className="tag tag-add" onClick={() => addToWatchlist(a)}>+ {a}</span>
          ))}
        </div>
      </div>

      {loading && (
        <div className="ai-thinking">
          <span className="dots"><span /><span /><span /></span>
          Analyzing {watchlist.length} assets for signals...
        </div>
      )}

      {signals.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Signals</span>
            <span className="card-subtitle">{signals.length} generated</span>
          </div>
          {signals.map((s) => (
            <div key={s.id} className="signal-row">
              <span className={`badge ${badgeClass(s.type)}`}>{s.type}</span>
              <span className="signal-text">{s.text}</span>
              <button className="link-btn small" onClick={() => createTradeFromSignal(s)}>
                → Trade
              </button>
            </div>
          ))}
        </div>
      )}

      {signals.length === 0 && !loading && (
        <div className="empty-state">
          <p>Configure your watchlist above and click Generate signals.</p>
          <p style={{ marginTop: 4, fontSize: 12 }}>The AI will analyze each asset and produce actionable trade ideas.</p>
        </div>
      )}
    </div>
  );
}
