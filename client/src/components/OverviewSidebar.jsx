import { useState, useEffect, useRef } from 'react';
import { getWatchlist } from '../services/watchlistApi';
import { readSentimentScore, getSentimentLabel } from '../utils/sentimentNormalization';

// Fetch sentiment scores for up to 10 watchlist symbols
async function fetchWatchlistInsights() {
  const watchlist = await getWatchlist();
  const symbols = watchlist
    .map(e => String(e?.ticker || e?.symbol || '').toUpperCase())
    .filter(Boolean)
    .slice(0, 10);

  if (!symbols.length) return { opportunity: null, risk: null };

  const results = await Promise.allSettled(
    symbols.map(async sym => {
      const res = await fetch(`/api/sentiment/latest/${encodeURIComponent(sym)}`);
      const data = await res.json().catch(() => null);
      const score = readSentimentScore(data);
      return { symbol: sym, score: score ?? 0, label: getSentimentLabel(score) };
    })
  );

  const scored = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => b.score - a.score);

  const opportunity = scored.find(s => s.score > 0.15) ?? null;
  const risk        = [...scored].reverse().find(s => s.score < -0.15) ?? null;

  return { opportunity, risk };
}

export default function OverviewSidebar({
  account,
  positions,
  orders,
  marketSnapshot,
  activeSymbol,
  onNavigateToAssistant,
}) {
  const [input, setInput]         = useState('');
  const [response, setResponse]   = useState('Ask AlphaBot anything about your portfolio or the market.');
  const [loading, setLoading]     = useState(false);
  const [insights, setInsights]   = useState({ opportunity: null, risk: null });
  const inputRef = useRef(null);

  useEffect(() => {
    fetchWatchlistInsights().then(setInsights).catch(() => {});
  }, []);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setLoading(true);
    setResponse('');

    try {
      const res = await fetch('http://localhost:3001/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: { account, positions, orders, marketSnapshot, symbol: activeSymbol || null },
        }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let full = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setResponse(full);
      }
    } catch {
      setResponse('Sorry — something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const { opportunity, risk } = insights;

  return (
    <div className="card ov-sidebar">
      {/* Header */}
      <div className="ov-sidebar-header">
        <span className="ov-sidebar-title">AlphaBot</span>
        <button className="ov-sidebar-fullbtn" onClick={onNavigateToAssistant}>
          Full view ↗
        </button>
      </div>

      {/* Briefing / response area */}
      <div className="ov-briefing">
        <div className="ov-briefing-label">
          {loading ? 'Thinking…' : 'Briefing · Morning summary in Part 5'}
        </div>
        <div className="ov-briefing-text">{response}</div>
      </div>

      {/* Opportunity insight */}
      {opportunity && (
        <div className="ov-insight ov-insight--bull">
          <div className="ov-insight-label">✦ Opportunity</div>
          <div className="ov-insight-text">
            {opportunity.symbol} sentiment {opportunity.score.toFixed(2)} · {opportunity.label}
          </div>
          <button
            className="ov-insight-btn"
            onClick={() => send(`Analyze ${opportunity.symbol} for a potential entry given the current sentiment`)}
          >
            Ask AlphaBot ↗
          </button>
        </div>
      )}

      {/* Risk insight */}
      {risk && (
        <div className="ov-insight ov-insight--bear">
          <div className="ov-insight-label">⚠ Risk alert</div>
          <div className="ov-insight-text">
            {risk.symbol} sentiment {risk.score.toFixed(2)} · {risk.label}
          </div>
          <button
            className="ov-insight-btn"
            onClick={() => send(`Should I cut or hold my ${risk.symbol} position given the sentiment?`)}
          >
            Review {risk.symbol} ↗
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="ov-sidebar-input-row">
        <input
          ref={inputRef}
          type="text"
          className="ov-sidebar-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AlphaBot…"
          disabled={loading}
        />
      </div>
    </div>
  );
}
