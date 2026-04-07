import { useEffect, useState } from "react";

export default function MarketSnapshot({ onSnapshot, loading, error }) {
  const [quotes, setQuotes] = useState(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const fetchSnapshot = async () => {
    try {
      setLocalLoading(true);
      setLocalError(null);

      const symbols = ["AMZN", "AAPL", "MSFT", "GOOGL", "TSLA", "META", "NVDA", "JPM", "V", "DIS", "NFLX", "PYPL", "INTC", "CSCO","BA","BTCUSD","SPY"];
      const results = [];

      for (const sym of symbols) {
        const r = await fetch(`/api/alpaca/quote/${sym}`);
        const data = await r.json();
        results.push({ symbol: sym, ...data });
      }

      setQuotes(results);
      if (onSnapshot) onSnapshot(results);
    } catch (err) {
      setLocalError("Unable to load snapshot.");
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, []);

  // Global loading OR local loading
  if (loading || localLoading) {
    return <div className="card">Loading snapshot…</div>;
  }

  // Global error OR local error
  if (error || localError) {
    return <div className="card error">Unable to load snapshot.</div>;
  }

  // Empty state
  if (!quotes || quotes.length === 0) {
    return <div className="card">No snapshot data.</div>;
  }

  return (
    <div className="card">
      <h3>Market Snapshot</h3>

      <button className="btn" onClick={fetchSnapshot}>
        Refresh
      </button>

      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Bid</th>
            <th>Ask</th>
          </tr>
        </thead>

        <tbody>
          {quotes.map((q) => {
            const bid = q.bp != null ? `$${q.bp.toFixed(2)}` : "—";
            const ask = q.ap != null ? `$${q.ap.toFixed(2)}` : "—";

            return (
              <tr key={q.symbol}>
                <td>{q.symbol}</td>
                <td>{bid}</td>
                <td>{ask}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
