export default function AccountCard({ account, loading, error }) {
  // Loading state
  if (loading) {
    return <div className="card">Loading account…</div>;
  }

  // Error state
  if (error) {
    return <div className="card error">Unable to load account.</div>;
  }

  // Empty state
  if (!account) {
    return <div className="card">No account data.</div>;
  }

  // Normal render
  return (
    <div className="card">
      <h3>Account Summary</h3>

      <div className="stat-list">
        <div className="stat-row">
          <span>Equity</span>
          <span>
            {account.equity != null
              ? `$${Number(account.equity).toFixed(2)}`
              : "—"}
          </span>
        </div>

        <div className="stat-row">
          <span>Cash</span>
          <span>
            {account.cash != null
              ? `$${Number(account.cash).toFixed(2)}`
              : "—"}
          </span>
        </div>

        <div className="stat-row">
          <span>Buying Power</span>
          <span>
            {account.buying_power != null
              ? `$${Number(account.buying_power).toFixed(2)}`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
