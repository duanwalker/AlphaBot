// src/components/Research.js
import React, { useState } from "react";
import { aiChat, market } from "../services/api";

const QUICK_QUERIES = [
  { label: "NVDA earnings outlook", q: "NVDA Q1 2025 earnings outlook, analyst estimates, key risks" },
  { label: "EUR/USD macro", q: "EUR/USD outlook: ECB policy, Fed divergence, key levels to watch in 2025" },
  { label: "S&P 500 technicals", q: "S&P 500 technical analysis: current trend, key support/resistance, short-term outlook" },
  { label: "Semiconductors sector", q: "Semiconductor sector outlook 2025: AI demand, supply chain, top stocks" },
  { label: "Fed rates impact", q: "Federal Reserve interest rate policy 2025 and impact on equities and forex" },
  { label: "Options IV analysis", q: "Current implied volatility environment for US equities and how to position options trades" },
];

export default function Research() {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState("");
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  async function runResearch(overrideQuery) {
    const q = overrideQuery || query;
    if (!q.trim()) return;
    setLoading(true);
    setResult("");
    setNews([]);
    try {
      const res = await aiChat(
        `You are a trading research analyst. Research request: "${q}"\n\nProvide a structured analysis including:\n1. Current situation / context\n2. Key price levels or data points\n3. Bullish case\n4. Bearish case / risks\n5. Trading implication — specific recommendation\n\nBe concise. Use real price levels where possible. Under 200 words total.`,
        "You are a senior sell-side trading analyst. Write concise, specific, trading-focused research. Include price targets, key levels, and clear trading implications. No generic disclaimers."
      );
      setResult(res.content);

      // Try to pull market news if ticker is specified
      if (ticker.trim()) {
        try {
          const newsData = await market.getNews(ticker.trim().toUpperCase());
          setNews(newsData.slice(0, 5));
        } catch {
          // Alpha Vantage not configured — silently skip
        }
      }
    } catch (e) {
      setResult(`Error: ${e.message}. Make sure your Anthropic API key is set in .env`);
    }
    setLoading(false);
  }

  return (
    <div className="tab-content">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">
          <span className="card-title">Market research</span>
          <span className="card-subtitle">AI-powered trading analysis</span>
        </div>

        <div className="input-row">
          <input
            className="text-input"
            placeholder="Research query — e.g. AAPL earnings impact, Fed meeting outlook, NVDA technical setup..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runResearch()}
          />
          <input
            className="text-input small"
            placeholder="Ticker (optional, for news)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="btn btn-primary" onClick={() => runResearch()} disabled={loading}>
            {loading ? "Researching..." : "Analyze ↗"}
          </button>
        </div>

        <div className="quick-adds" style={{ marginTop: 10 }}>
          {QUICK_QUERIES.map((q) => (
            <span
              key={q.label}
              className="tag tag-add"
              onClick={() => {
                setQuery(q.q);
                runResearch(q.q);
              }}
            >
              {q.label}
            </span>
          ))}
        </div>
      </div>

      {loading && (
        <div className="ai-thinking">
          <span className="dots"><span /><span /><span /></span>
          Researching market conditions...
        </div>
      )}

      {result && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header">
            <span className="card-title">Analysis</span>
            <span className="badge badge-buy" style={{ fontSize: 10 }}>AI</span>
          </div>
          <div className="research-body">
            {result.split("\n").map((line, i) => (
              <p key={i} style={{ marginBottom: 8 }}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {news.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent news — {ticker.toUpperCase()}</span>
          </div>
          {news.map((item, i) => (
            <div key={i} className="news-row">
              <div className="news-title">
                <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              </div>
              <div className="news-meta">
                {item.source} ·{" "}
                <span className={item.overall_sentiment_label === "Bullish" ? "pos" : item.overall_sentiment_label === "Bearish" ? "neg" : ""}>
                  {item.overall_sentiment_label || "Neutral"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
