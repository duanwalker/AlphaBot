function UsageChart({ events = [] }) {
  const values = events.map((event) => Number(event.totalTokens) || 0);
  const max = values.length > 0 ? Math.max(...values, 1) : 1;

  return (
    <section className="settings-block">
      <h4>Usage Trend (Placeholder)</h4>
      <div className="usage-chart" role="img" aria-label="Usage trend placeholder chart">
        {values.length === 0 ? (
          <p className="settings-copy">No usage events yet.</p>
        ) : (
          values.map((value, index) => {
            const heightPercent = Math.max(8, Math.round((value / max) * 100));
            return (
              <div key={`${index}-${value}`} className="usage-chart-item" title={`${value} tokens`}>
                <div className="usage-chart-bar" style={{ height: `${heightPercent}%` }} />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default UsageChart;
