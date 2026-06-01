import { useState, useEffect } from 'react';

function TradingModeToggle() {
  const [mode, setMode]     = useState('paper');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/api/settings/trading-mode')
      .then(r => r.json())
      .then(data => setMode(data.mode))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(newMode) {
    if (newMode === 'live') {
      const confirmed = window.confirm(
        '⚠ Switch to LIVE trading?\n\n' +
        'Real money will be at risk.\n' +
        'All orders will execute against your live Alpaca brokerage account.\n\n' +
        "Make sure you have reviewed AlphaBot's recommendations carefully before placing any live trades."
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/trading-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update');
        return;
      }
      setMode(data.mode);
    } catch {
      setError('Failed to update trading mode');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="trading-mode-loading" />;

  return (
    <div className="trading-mode-section">
      <h3>Trading Account</h3>

      {mode === 'live' && (
        <div className="trading-mode-live-warning">
          ⚠ LIVE TRADING ACTIVE — real money at risk
        </div>
      )}

      <div className="trading-mode-toggle">
        <button
          className={`trading-mode-btn${mode === 'paper' ? ' active' : ''}`}
          onClick={() => handleToggle('paper')}
          disabled={saving || mode === 'paper'}
        >
          Paper trading
          <span className="trading-mode-desc">Simulated — no real money</span>
        </button>
        <button
          className={`trading-mode-btn${mode === 'live' ? ' active live' : ''}`}
          onClick={() => handleToggle('live')}
          disabled={saving || mode === 'live'}
        >
          Live trading
          <span className="trading-mode-desc">Real money — use carefully</span>
        </button>
      </div>

      {error && <p className="trading-mode-error">{error}</p>}

      <p className="trading-mode-note">
        {mode === 'paper'
          ? 'Connected to Alpaca paper trading account. Safe to experiment.'
          : 'Connected to Alpaca live brokerage account. All trades use real money.'}
      </p>
    </div>
  );
}

function TradingAccount() {
  return (
    <section>
      <TradingModeToggle />
    </section>
  );
}

export default TradingAccount;
