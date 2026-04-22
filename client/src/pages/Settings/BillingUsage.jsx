import { useEffect, useState } from "react";
import UsageChart from "./BillingUsage/UsageChart";
import UsageTable from "./BillingUsage/UsageTable";

function BillingUsage() {
  const [summary, setSummary] = useState({
    totalTokens: 0,
    totalCost: 0,
    totalRequests: 0,
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadUsage() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/usage/logs");
        if (!response.ok) {
          throw new Error(`Failed to load usage logs (${response.status})`);
        }

        const data = await response.json();
        setSummary({
          totalTokens: Number(data?.summary?.totalTokens) || 0,
          totalCost: Number(data?.summary?.totalCost) || 0,
          totalRequests: Number(data?.summary?.totalRequests) || 0,
        });
        setEvents(Array.isArray(data?.events) ? data.events : []);
      } catch (err) {
        setError(err.message || "Failed to load usage logs");
      } finally {
        setLoading(false);
      }
    }

    loadUsage();
  }, []);

  return (
    <section>
      <h3>Billing & Usage</h3>
      <p className="settings-copy">Track request volume, token usage, and estimated cost.</p>

      {error && <p className="settings-error">{error}</p>}
      {loading && <p className="settings-copy">Loading usage metrics...</p>}

      {!loading && (
        <>
          <div className="settings-metrics-grid">
            <div className="settings-metric card">
              <span className="settings-metric-label">Total Tokens</span>
              <strong className="settings-metric-value">{summary.totalTokens.toLocaleString()}</strong>
            </div>
            <div className="settings-metric card">
              <span className="settings-metric-label">Total Cost</span>
              <strong className="settings-metric-value">${summary.totalCost.toFixed(2)}</strong>
            </div>
            <div className="settings-metric card">
              <span className="settings-metric-label">Total Requests</span>
              <strong className="settings-metric-value">{summary.totalRequests.toLocaleString()}</strong>
            </div>
          </div>

          <UsageChart events={events} />
          <UsageTable events={events} />
        </>
      )}
    </section>
  );
}

export default BillingUsage;
