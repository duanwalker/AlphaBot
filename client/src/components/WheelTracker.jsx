import { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── IncomeChart ───────────────────────────────────────────────

function IncomeChart({ income }) {
  if (!income || income.length === 0) {
    return (
      <div className="wheel-income-empty">
        Income chart will appear after your first completed position.
      </div>
    );
  }

  const data = income.slice(0, 6).reverse().map(record => {
    const parts = (record.rowKey || '').split('-');
    const y = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10) - 1;
    const label = !isNaN(y) && !isNaN(mo)
      ? new Date(y, mo).toLocaleDateString('en-US', { month: 'short' })
      : record.rowKey || '';
    return { month: label, income: parseFloat(record.premiumCollected || 0) };
  });

  return (
    <div className="wheel-income-chart">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `$${v}`}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={v => [`$${parseFloat(v).toFixed(2)}`, 'Premium']}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Bar dataKey="income" fill="#1D9E75" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── PositionsList ─────────────────────────────────────────────

function PositionsList({ positions, title, onReload }) {
  async function handleExpire(pos) {
    const id = pos.rowKey || pos.id;
    await fetch(`/api/wheel/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'expired', totalPremium: pos.totalPremium }),
    });
    onReload();
  }

  async function handleAssign(pos) {
    const id = pos.rowKey || pos.id;
    await fetch(`/api/wheel/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'assigned',
        assigned: true,
        assignedAt: new Date().toISOString(),
        assignedPrice: pos.strike,
        sharesAcquired: (pos.contracts || 1) * 100,
      }),
    });
    onReload();
  }

  async function handleCalledAway(pos) {
    const id = pos.rowKey || pos.id;
    await fetch(`/api/wheel/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'called_away',
        calledAway: true,
        calledAwayAt: new Date().toISOString(),
      }),
    });
    onReload();
  }

  return (
    <div className="wheel-positions-section">
      {title && <div className="wheel-section-title">{title}</div>}
      {positions.length === 0 ? (
        <div className="wheel-empty-state">No positions to display.</div>
      ) : (
        <div className="wheel-table-wrap">
          <table className="wheel-positions-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Type</th>
                <th>Strike</th>
                <th>Expiry</th>
                <th>Contracts</th>
                <th>Premium</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => {
                const key = pos.rowKey || pos.id || `${pos.ticker}-${pos.strike}-${pos.expiry}`;
                const typeClass = (pos.contractType || '').toLowerCase();
                const statusClass = (pos.status || '').replace('_', '-');
                return (
                  <tr key={key}>
                    <td className="wheel-col-ticker">{pos.ticker}</td>
                    <td>
                      <span className={`wheel-badge ${typeClass}`}>
                        {pos.contractType}
                      </span>
                    </td>
                    <td>${parseFloat(pos.strike || 0).toFixed(2)}</td>
                    <td>{pos.expiry}</td>
                    <td>{pos.contracts}</td>
                    <td>${parseFloat(pos.totalPremium || 0).toFixed(2)}</td>
                    <td>
                      <span className={`wheel-status-badge ${statusClass}`}>
                        {(pos.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="wheel-col-actions">
                      {pos.status === 'open' && pos.contractType === 'CSP' && (
                        <>
                          <button className="wheel-action-btn" onClick={() => handleExpire(pos)}>Expire</button>
                          <button className="wheel-action-btn wheel-action-btn--assign" onClick={() => handleAssign(pos)}>Assign</button>
                        </>
                      )}
                      {pos.status === 'open' && pos.contractType === 'CC' && (
                        <>
                          <button className="wheel-action-btn" onClick={() => handleExpire(pos)}>Expire</button>
                          <button className="wheel-action-btn wheel-action-btn--assign" onClick={() => handleCalledAway(pos)}>Called away</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── AddPositionModal ──────────────────────────────────────────

function AddPositionModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    ticker: '',
    contractType: 'CSP',
    strike: '',
    expiry: '',
    contracts: 1,
    premiumPerContract: '',
    openPrice: '',
    brokerId: '',
    account: 'paper',
    notes: '',
  });

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const contracts = parseInt(form.contracts, 10) || 0;
  const premium = parseFloat(form.premiumPerContract) || 0;
  const strike = parseFloat(form.strike) || 0;
  const totalPremium = premium * contracts * 100;
  const capitalRequired = strike * contracts * 100;
  const daysToExpiry = form.expiry
    ? Math.max(1, (new Date(form.expiry) - new Date()) / (1000 * 60 * 60 * 24))
    : 1;
  const returnPct = capitalRequired > 0 ? totalPremium / capitalRequired : 0;
  const annualizedReturn = (returnPct / daysToExpiry) * 365 * 100;
  const showCalc = contracts > 0 && premium > 0 && strike > 0 && form.expiry;
  const canSave = form.ticker.trim() && form.strike && form.expiry && form.premiumPerContract;

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="wheel-modal-overlay" onClick={handleOverlayClick}>
      <div className="wheel-modal">
        <div className="wheel-modal-header">
          <span>Log Wheel Position</span>
          <button className="wheel-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="wheel-modal-body">
          <div className="wheel-form-row">
            <div className="wheel-form-field">
              <label>Ticker</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => update('ticker', e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
            </div>
            <div className="wheel-form-field">
              <label>Contract type</label>
              <select value={form.contractType} onChange={e => update('contractType', e.target.value)}>
                <option value="CSP">CSP — Cash-secured put</option>
                <option value="CC">CC — Covered call</option>
              </select>
            </div>
          </div>

          <div className="wheel-form-row">
            <div className="wheel-form-field">
              <label>Strike price</label>
              <input
                type="number"
                value={form.strike}
                onChange={e => update('strike', e.target.value)}
                placeholder="150.00"
                step="0.5"
              />
            </div>
            <div className="wheel-form-field">
              <label>Expiry date</label>
              <input
                type="date"
                value={form.expiry}
                onChange={e => update('expiry', e.target.value)}
              />
            </div>
          </div>

          <div className="wheel-form-row">
            <div className="wheel-form-field">
              <label>Contracts</label>
              <input
                type="number"
                min={1}
                value={form.contracts}
                onChange={e => update('contracts', e.target.value)}
              />
            </div>
            <div className="wheel-form-field">
              <label>Premium per contract</label>
              <input
                type="number"
                value={form.premiumPerContract}
                onChange={e => update('premiumPerContract', e.target.value)}
                placeholder="2.50"
                step="0.01"
              />
            </div>
          </div>

          {showCalc && (
            <div className="wheel-calc-preview">
              <span>Total premium: <strong>${totalPremium.toFixed(2)}</strong></span>
              <span>Capital required: <strong>${capitalRequired.toLocaleString()}</strong></span>
              <span>Est. annualized return: <strong>{annualizedReturn.toFixed(1)}%</strong></span>
            </div>
          )}

          <div className="wheel-form-row">
            <div className="wheel-form-field">
              <label>Open price <span className="wheel-optional">(optional)</span></label>
              <input
                type="number"
                value={form.openPrice}
                onChange={e => update('openPrice', e.target.value)}
                placeholder="148.50"
                step="0.01"
              />
            </div>
            <div className="wheel-form-field">
              <label>Broker order ID <span className="wheel-optional">(optional)</span></label>
              <input
                type="text"
                value={form.brokerId}
                onChange={e => update('brokerId', e.target.value)}
              />
            </div>
          </div>

          <div className="wheel-form-row">
            <div className="wheel-form-field">
              <label>Account</label>
              <select value={form.account} onChange={e => update('account', e.target.value)}>
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="wheel-form-field">
              <label>Notes <span className="wheel-optional">(optional)</span></label>
              <input
                type="text"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="wheel-modal-footer">
          <button className="wheel-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="wheel-btn-save"
            onClick={() => onSave(form)}
            disabled={!canSave}
          >
            Log position
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WheelTracker (main) ───────────────────────────────────────

export default function WheelTracker() {
  const [positions, setPositions]         = useState([]);
  const [income, setIncome]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [activeView, setActiveView]       = useState('dashboard');
  const [showAddModal, setShowAddModal]   = useState(false);
  const [historyPositions, setHistoryPositions] = useState([]);
  const historyFetched = useRef(false);

  async function loadData() {
    setLoading(true);
    try {
      const [posRes, incRes] = await Promise.all([
        fetch('/api/wheel/positions'),
        fetch('/api/wheel/income'),
      ]);
      const [posData, incData] = await Promise.all([
        posRes.json(),
        incRes.json(),
      ]);
      setPositions(posData.positions || []);
      setIncome(incData.income || []);
    } catch (err) {
      console.error('[WheelTracker] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function loadHistory() {
    if (historyFetched.current) return;
    historyFetched.current = true;
    try {
      const res = await fetch('/api/wheel/positions/all');
      const data = await res.json();
      setHistoryPositions(data.positions || []);
    } catch (err) {
      console.error('[WheelTracker] history error:', err.message);
    }
  }

  function handleViewChange(view) {
    setActiveView(view);
    if (view === 'history') loadHistory();
  }

  async function handleSave(form) {
    try {
      await fetch('/api/wheel/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowAddModal(false);
      loadData();
    } catch (err) {
      console.error('[WheelTracker] save error:', err.message);
    }
  }

  function reloadHistory() {
    historyFetched.current = false;
    loadHistory();
  }

  // Computed values
  const currentMonthIncome = parseFloat(income[0]?.premiumCollected || 0);
  const openCSPs = positions.filter(p => p.contractType === 'CSP');
  const openCCs  = positions.filter(p => p.contractType === 'CC');
  const capitalAtWork = positions.reduce(
    (s, p) => s + (parseFloat(p.strike || 0) * parseInt(p.contracts || 0, 10) * 100),
    0,
  );

  if (loading) {
    return <div className="wheel-loading">Loading wheel data…</div>;
  }

  return (
    <div className="wheel-tracker">
      {/* Header */}
      <div className="wheel-header">
        <div className="wheel-header-text">
          <div className="wheel-title">Wheel Strategy</div>
          <div className="wheel-subtitle">Cash-secured puts &amp; covered calls income tracker</div>
        </div>
        <button className="wheel-add-btn" onClick={() => setShowAddModal(true)}>
          + Log position
        </button>
      </div>

      {/* Stat cards */}
      <div className="wheel-stat-cards">
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">This month</div>
          <div className="wheel-stat-value green">${currentMonthIncome.toFixed(2)}</div>
          <div className="wheel-stat-sub">Premium collected</div>
        </div>
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">Open positions</div>
          <div className="wheel-stat-value">{positions.length}</div>
          <div className="wheel-stat-sub">{openCSPs.length} CSP · {openCCs.length} CC</div>
        </div>
        <div className="wheel-stat-card">
          <div className="wheel-stat-label">Capital at work</div>
          <div className="wheel-stat-value">${capitalAtWork.toLocaleString()}</div>
          <div className="wheel-stat-sub">Across all positions</div>
        </div>
      </div>

      {/* Inner view tabs */}
      <div className="wheel-inner-tabs">
        {['dashboard', 'positions', 'history'].map(view => (
          <button
            key={view}
            className={`wheel-inner-tab${activeView === view ? ' active' : ''}`}
            onClick={() => handleViewChange(view)}
          >
            {view.charAt(0).toUpperCase() + view.slice(1)}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {activeView === 'dashboard' && (
        <div className="wheel-view-content">
          <IncomeChart income={income} />
          {positions.length === 0 ? (
            <div className="wheel-empty-state">
              No open positions. Log your first wheel position to start tracking premium income.
            </div>
          ) : (
            <>
              {openCSPs.length > 0 && (
                <PositionsList positions={openCSPs} title="Open puts (CSP)" onReload={loadData} />
              )}
              {openCCs.length > 0 && (
                <PositionsList positions={openCCs} title="Open calls (CC)" onReload={loadData} />
              )}
            </>
          )}
        </div>
      )}

      {/* Positions */}
      {activeView === 'positions' && (
        <div className="wheel-view-content">
          <PositionsList positions={positions} title="Open positions" onReload={loadData} />
        </div>
      )}

      {/* History — lazy-loaded on first visit */}
      {activeView === 'history' && (
        <div className="wheel-view-content">
          <PositionsList positions={historyPositions} title="All positions" onReload={reloadHistory} />
        </div>
      )}

      {showAddModal && (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
