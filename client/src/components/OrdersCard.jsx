export default function OrdersCard({ orders, loading, error }) {
  // Loading state
  if (loading) {
    return <div className="card">Loading orders…</div>;
  }

  // Error state
  if (error) {
    return <div className="card error">Unable to load orders.</div>;
  }

  // Empty state
  if (!orders || orders.length === 0) {
    return <div className="card">No recent orders.</div>;
  }

  // Normal render
  return (
    <div className="card">
      <h3>Recent Orders</h3>

      <table className="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((o) => {
            const side = o.side ? o.side.toUpperCase() : "—";
            const qty = o.qty != null ? o.qty : "—";
            const status = o.status || "—";

            return (
              <tr key={o.id}>
                <td>{o.symbol || "—"}</td>

                <td className={o.side === "buy" ? "pl-pos" : "pl-neg"}>
                  {side}
                </td>

                <td>{qty}</td>
                <td>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
