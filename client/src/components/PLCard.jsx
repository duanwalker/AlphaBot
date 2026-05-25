function fmt(n) {
  if (n == null) return '—';
  return Number(Math.abs(n)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sign(n) {
  return n == null ? '' : n >= 0 ? '+' : '−';
}

function plClass(n) {
  return n == null ? '' : n >= 0 ? 'pos' : 'neg';
}

export default function PLCard({ account, positions }) {
  const equity     = account?.equity      != null ? Number(account.equity)      : null;
  const lastEquity = account?.last_equity != null ? Number(account.last_equity) : null;
  const net        = equity != null && lastEquity != null ? equity - lastEquity : null;

  const unrealized = Array.isArray(positions)
    ? positions.reduce((s, p) => s + Number(p.unrealized_pl ?? 0), 0)
    : null;

  const realized = net != null && unrealized != null ? net - unrealized : null;

  return (
    <div className="card ov-pl-card">
      <div className="ov-card-title">Today's P&amp;L</div>

      <div className={`ov-pl-net ${plClass(net)}`}>
        {net != null ? `${sign(net)}$${fmt(net)}` : '—'}
      </div>

      <div className="ov-pl-row">
        <span>Realized</span>
        <span className={plClass(realized)}>
          {realized != null ? `${sign(realized)}$${fmt(realized)}` : '—'}
        </span>
      </div>
      <div className="ov-pl-row">
        <span>Unrealized</span>
        <span className={plClass(unrealized)}>
          {unrealized != null ? `${sign(unrealized)}$${fmt(unrealized)}` : '—'}
        </span>
      </div>
    </div>
  );
}
