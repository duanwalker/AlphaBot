import { useState } from 'react';
import { useTradingMode } from '../context/TradingModeContext';

function TradingModeToggle() {
  const { tradingMode: mode, modeLoading: loading, updateTradingMode } = useTradingMode();
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleToggle(newMode) {
    if (newMode === 'live') {
      (true);
      return;setShowConfirm
    }
    switchMode('paper');
  }

  async function switchMode(newMode) {
    setSaving(true);
    setError(null);
    try {
      await updateTradingMode(newMode);
      setShowConfirm(false);
    } catch (err) {
      setError(err.message || 'Failed to update trading mode');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="trading-mode-loading" />;

  return (
    <section className="trading-mode-section">
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
          className={`trading-mode-btn${mode === 'live' ? ' active live' : ' live'}`}
          onClick={() => handleToggle('live')}
          disabled={saving || mode === 'live'}
        >
          Live trading
          <span className="trading-mode-desc">Real money — use carefully</span>
        </button>
      </div>

      {showConfirm && (
        <div className="trading-mode-confirm-dialog">
          <p>
            <strong>Switch to LIVE trading?</strong>
          </p>
          <p>
            Real money will be at risk. All orders will execute against your live
            Alpaca brokerage account. Review AlphaBot's recommendations carefully
            before placing any live trades.
          </p>
          <div className="trading-mode-confirm-actions">
            <button onClick={() => setShowConfirm(false)}>Cancel</button>
            <button onClick={() => switchMode('live')} disabled={saving}>
              Yes, switch to live
            </button>
          </div>
        </div>
      )}

      {error && <p className="trading-mode-error">{error}</p>}

      <p className="trading-mode-note">
        {mode === 'paper'
          ? 'Connected to Alpaca paper trading account. Safe to experiment.'
          : 'Connected to Alpaca live brokerage account. All trades use real money.'}
      </p>
    </section>
  );
}

export default TradingModeToggle;
