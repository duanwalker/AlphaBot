export default function PositionsCard({ positions, loading, error }) {
  // Loading state
  if (loading) {
    return <div className="card">Loading positions…</div>;
  }

  // Error state
  if (error) {
    return <div className="card error">Unable to load positions.</div>;
  }

  // Empty state
  if (!positions || positions.length === 0) {
    return <div className="card">No positions.</div>;
  }

  // Normal render
  return (
    <div className="card">
      <h3>Positions</h3>

      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>Value</th>
            <th>P/L</th>
          </tr>
        </thead>

        <tbody>
          {positions.map((p) => {
            const value = p.market_value != null ? Number(p.market_value) : null;
            const pl = p.unrealized_pl != null ? Number(p.unrealized_pl) : null;

            return (
              <tr key={p.asset_id}>
                <td>{p.symbol}</td>
                <td>{p.qty}</td>

                <td>
                  {value != null ? `$${value.toFixed(2)}` : "—"}
                </td>

                <td className={pl >= 0 ? "pl-pos" : "pl-neg"}>
                  {pl != null ? `$${pl.toFixed(2)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
