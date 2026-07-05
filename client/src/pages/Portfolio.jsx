import { useState } from 'react';
import PLCard from '../components/PLCard';
import { useSymbol } from '../context/SymbolContext';

const OCC_REGEX = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;

function parseOptions(symbol) {
  const m = symbol.match(OCC_REGEX);
  if (!m) return null;
  const [, underlying, date, type, strike] = m;
  const yr = '20' + date.slice(0, 2);
  const mo = date.slice(2, 4);
  const dy = date.slice(4, 6);
  return {
    underlying,
    expiry: `${yr}-${mo}-${dy}`,
    type,
    strike: (Number(strike) / 1000).toFixed(2),
    label: `${underlying} ${mo}/${dy}/${yr} $${(Number(strike) / 1000).toFixed(0)} ${type === 'C' ? 'Call' : 'Put'}`,
  };
}

function isOption(p) {
  return p.asset_class === 'us_option' || OCC_REGEX.test(p.symbol);
}

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null) return '—';
  return (Number(n) * 100).toFixed(2) + '%';
}

function plCls(n) {
  return n == null ? '' : Number(n) >= 0 ? 'pl-pos' : 'pl-neg';
}

function sgn(n) {
  return n == null ? '' : Number(n) >= 0 ? '+' : '-';
}

const BAR_COLORS = ['#6366f1', '#4ade80', '#f59e0b', '#f87171', '#38bdf8', '#a78bfa', '#fb923c', '#34d399'];

const PENDING_STATUSES = new Set([
  'new',
  'pending_new',
  'accepted',
  'pending_replace',
  'held',
  'partially_filled',
]);

const FILLED_STATUSES = new Set([
  'filled',
]);

const CANCELLED_STATUSES = new Set([
  'canceled',
  'cancelled',
  'expired',
  'replaced',
  'rejected',
  'suspended',
  'done_for_day',
]);

function getStatusDisplay(status) {
  if (!status) {
    return { label: '—', className: 'pf-status--default' };
  }

  if (FILLED_STATUSES.has(status)) {
    return { label: '● Filled', className: 'pf-status--filled' };
  }

  if (PENDING_STATUSES.has(status)) {
    return { label: '◌ Pending', className: 'pf-status--pending' };
  }

  if (CANCELLED_STATUSES.has(status)) {
    return { label: '✕ Cancelled', className: 'pf-status--cancelled' };
  }

  return { label: status, className: 'pf-status--default' };
}

export default function Portfolio({ account, positions, orders, loading, error, setActiveTab }) {
  const { symbol: activeSymbol } = useSymbol();
  const [orderFilter, setOrderFilter] = useState('all');

  const stockPos = (positions ?? []).filter(p => !isOption(p));
  const optPos   = (positions ?? []).filter(p => isOption(p));

  const equity      = account?.equity       != null ? Number(account.equity)       : null;
  const lastEquity  = account?.last_equity  != null ? Number(account.last_equity)  : null;
  const buyingPower = account?.buying_power != null ? Number(account.buying_power) : null;
  const dayPL       = equity != null && lastEquity != null ? equity - lastEquity : null;

  const filteredOrders = (orders ?? []).filter(o => {
    if (orderFilter === 'filled') return FILLED_STATUSES.has(o.status);
    if (orderFilter === 'pending') return PENDING_STATUSES.has(o.status);
    return true;
  });

  const totalMktValue = stockPos.reduce((s, p) => s + Number(p.market_value ?? 0), 0);
  const allocs = stockPos
    .map(p => ({ symbol: p.symbol, value: Number(p.market_value ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map(p => ({ ...p, pct: totalMktValue > 0 ? (p.value / totalMktValue) * 100 : 0 }));

  return (
    <div className="pf-layout">
      {error && <div className="alert error">{error}</div>}

      {/* ── Row 1: Five stat cards ── */}
      <div className="pf-stat-row">
        <div
          className="card pf-stat-card pf-stat-card--nav"
          onClick={() => setActiveTab?.('overview')}
          title="Back to Overview"
        >
          <div className="pf-stat-label">Total Value</div>
          <div className="pf-stat-value">{loading ? '…' : equity != null ? fmtMoney(equity) : '—'}</div>
          <div className="pf-stat-nav-hint">↗ Overview</div>
        </div>

        <div className="card pf-stat-card">
          <div className="pf-stat-label">Day P&amp;L</div>
          <div className={`pf-stat-value ${plCls(dayPL)}`}>
            {loading ? '…' : dayPL != null ? `${sgn(dayPL)}${fmtMoney(dayPL)}` : '—'}
          </div>
        </div>

        <div className="card pf-stat-card">
          <div className="pf-stat-label">Buying Power</div>
          <div className="pf-stat-value">{loading ? '…' : buyingPower != null ? fmtMoney(buyingPower) : '—'}</div>
        </div>

        <div className="card pf-stat-card">
          <div className="pf-stat-label">Stock Positions</div>
          <div className="pf-stat-value">{loading ? '…' : stockPos.length}</div>
        </div>

        <div className="card pf-stat-card">
          <div className="pf-stat-label">Options Positions</div>
          <div className="pf-stat-value">{loading ? '…' : optPos.length}</div>
        </div>
      </div>

      {/* ── Row 2: Stocks table + Options positions table ── */}
      <div className="pf-row2">
        <div className="card pf-table-card">
          <h3>Stocks <span className="pf-count">{stockPos.length} open</span></h3>
          {loading ? (
            <p className="pf-empty">Loading…</p>
          ) : stockPos.length === 0 ? (
            <p className="pf-empty">No stock positions.</p>
          ) : (
            <div className="pf-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Details</th>
                    <th>Value</th>
                    <th>P&amp;L</th>
                    <th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {stockPos.map(p => {
                    const pl   = p.unrealized_pl   != null ? Number(p.unrealized_pl)   : null;
                    const plpc = p.unrealized_plpc != null ? Number(p.unrealized_plpc) : null;
                    const isActive = activeSymbol && p.symbol === activeSymbol;
                    return (
                      <tr key={p.asset_id ?? p.symbol} className={isActive ? 'pf-row--active' : ''}>
                        <td className="pf-symbol">{p.symbol}</td>
                        <td className="pf-details">
                          {p.qty} sh
                          {p.avg_entry_price && (
                            <span className="pf-sub"> @ ${Number(p.avg_entry_price).toFixed(2)}</span>
                          )}
                        </td>
                        <td>{p.market_value != null ? fmtMoney(p.market_value) : '—'}</td>
                        <td className={plCls(pl)}>
                          {pl != null ? `${sgn(pl)}${fmtMoney(pl)}` : '—'}
                        </td>
                        <td className={plCls(plpc)}>
                          {plpc != null ? `${sgn(plpc)}${fmtPct(plpc)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pf-table-card">
          <h3>Options <span className="pf-count">{optPos.length} open</span></h3>
          {loading ? (
            <p className="pf-empty">Loading…</p>
          ) : optPos.length === 0 ? (
            <p className="pf-empty">No options positions.</p>
          ) : (
            <div className="pf-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Value</th>
                    <th>P&amp;L</th>
                    <th>Return</th>
                  </tr>
                </thead>
                <tbody>
                  {optPos.map(p => {
                    const parsed = parseOptions(p.symbol);
                    const pl     = p.unrealized_pl   != null ? Number(p.unrealized_pl)   : null;
                    const plpc   = p.unrealized_plpc != null ? Number(p.unrealized_plpc) : null;
                    const isActive = activeSymbol && parsed?.underlying === activeSymbol;
                    return (
                      <tr key={p.asset_id ?? p.symbol} className={isActive ? 'pf-row--active' : ''}>
                        <td>
                          <div className="pf-contract-row">
                            {parsed ? (
                              <>
                                <span className={`pf-badge pf-badge--${parsed.type === 'C' ? 'call' : 'put'}`}>
                                  {parsed.type === 'C' ? 'Call' : 'Put'}
                                </span>
                                <span className="pf-contract-label">{parsed.label}</span>
                              </>
                            ) : (
                              <span>{p.symbol}</span>
                            )}
                          </div>
                        </td>
                        <td>{p.market_value != null ? fmtMoney(p.market_value) : '—'}</td>
                        <td className={plCls(pl)}>
                          {pl != null ? `${sgn(pl)}${fmtMoney(pl)}` : '—'}
                        </td>
                        <td className={plCls(plpc)}>
                          {plpc != null ? `${sgn(plpc)}${fmtPct(plpc)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Order history + P&L breakdown + Allocation bars ── */}
      <div className="pf-row3">
        <div className="card pf-table-card">
          <div className="pf-orders-header">
            <h3>Order History</h3>
            <div className="pf-filter-row">
              {['all', 'filled', 'pending'].map(f => (
                <button
                  key={f}
                  className={`pf-filter-btn${orderFilter === f ? ' active' : ''}`}
                  onClick={() => setOrderFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="pf-empty">Loading…</p>
          ) : filteredOrders.length === 0 ? (
            <p className="pf-empty">No orders.</p>
          ) : (
            <div className="pf-table-scroll">
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
                  {filteredOrders.map(o => {
                    const { label, className } = getStatusDisplay(o.status);

                    return (
                    <tr key={o.id}>
                      <td>{o.symbol || '—'}</td>
                      <td className={o.side === 'buy' ? 'pl-pos' : 'pl-neg'}>
                        {o.side ? o.side.toUpperCase() : '—'}
                      </td>
                      <td>{o.qty ?? '—'}</td>
                      <td>
                        <span className={`pf-status ${className}`}>{label}</span>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PLCard account={account} positions={positions} />

        <div className="card pf-alloc-card">
          <div className="pf-alloc-title">Allocation</div>
          {loading ? (
            <p className="pf-empty">Loading…</p>
          ) : allocs.length === 0 ? (
            <p className="pf-empty">No positions.</p>
          ) : (
            <div className="pf-alloc-list">
              {allocs.map((a, i) => (
                <div key={a.symbol} className="pf-alloc-row">
                  <div className="pf-alloc-meta">
                    <span className="pf-alloc-sym">{a.symbol}</span>
                    <span className="pf-alloc-pct">{a.pct.toFixed(1)}%</span>
                  </div>
                  <div className="pf-alloc-track">
                    <div
                      className="pf-alloc-bar"
                      style={{ width: `${a.pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
