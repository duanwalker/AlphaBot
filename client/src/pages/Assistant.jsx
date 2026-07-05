import { useState } from 'react';
import AssistantPanel from '../components/AssistantPanel';
import useInsights from '../hooks/useInsights';

const ACCENT = {
  opportunity: '#1D9E75',
  risk:        '#E24B4A',
  briefing:    '#378ADD',
};

const TYPE_LABEL = {
  opportunity: '✦ Opportunity',
  risk:        '⚠ Risk',
  briefing:    '◉ Briefing',
};

const TYPE_COLOR = {
  opportunity: 'var(--color-text-success)',
  risk:        'var(--color-text-danger)',
  briefing:    'var(--color-text-info)',
};

function InsightCard({ insight, onSend }) {
  const accent = ACCENT[insight.type] ?? ACCENT.briefing;
  const timestamp = insight.timestamp
    ? new Date(insight.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <div className="ai-insight" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="ai-insight-label" style={{ color: TYPE_COLOR[insight.type] ?? TYPE_COLOR.briefing }}>
        {TYPE_LABEL[insight.type] ?? '◉ Update'} · {insight.ticker} · {timestamp}
      </div>
      <div className="ai-insight-title">{insight.title}</div>
      <div className="ai-insight-desc">{insight.body}</div>
      {insight.action && (
        <div className="ai-insight-actions">
          <button className="ai-insight-btn" onClick={() => onSend(insight.action)}>
            Ask AlphaBot ↗
          </button>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage({
  account,
  positions,
  orders,
  marketSnapshot,
  onNavigate,
}) {
  const [externalPrompt, setExternalPrompt] = useState(null);
  const { insights, loading: insightsLoading } = useInsights();

  function sendPrompt(text) {
    setExternalPrompt({ text, id: Date.now() });
  }

  return (
    <div className="ai-layout">
      {/* ── Left: proactive insights ── */}
      <div className="ai-col">
        <div className="ai-col-label">Proactive insights</div>

        {insightsLoading ? (
          <p className="ai-loading">Loading insights…</p>
        ) : (
          <div className="ai-insights-feed">
            {insights.length === 0 ? (
              <p className="ai-loading">No insights available yet.</p>
            ) : (
              insights.map((insight, i) => (
                <InsightCard
                  key={insight.ticker ? `${insight.type}-${insight.ticker}` : i}
                  insight={insight}
                  onSend={sendPrompt}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Right: conversation ── */}
      <div className="ai-col">
        <div className="ai-col-label">Conversation</div>
        <AssistantPanel
          inline
          open
          account={account}
          positions={positions}
          orders={orders}
          marketSnapshot={marketSnapshot}
          externalPrompt={externalPrompt}
        />
      </div>
    </div>
  );
}
