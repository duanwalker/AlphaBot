import { useState } from 'react';
import useToast from '../hooks/useToast';

const ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'];

export default function ResearchTradeWidget({ symbol, onNavigateOptions, onSetSymbol }) {
  const [side, setSide]           = useState('buy');
  const [qty, setQty]             = useState(1);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const needsLimit = orderType === 'limit' || orderType === 'stop_limit';
  const needsStop  = orderType === 'stop'  || orderType === 'stop_limit';

  async function handlePlaceOrder() {
    if (!symbol) return;

    const body = {
      symbol,
      qty: Number(qty),
      side,
      type: orderType,
      time_in_force: 'day',
      ...(needsLimit && limitPrice ? { limit_price: limitPrice } : {}),
      ...(needsStop  && limitPrice ? { stop_price:  limitPrice } : {}),
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/alpaca/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Order failed');
      }

      toast.success(`${side === 'buy' ? 'Buy' : 'Sell'} order placed for ${qty} × ${symbol}`);
      setQty(1);
      setLimitPrice('');
    } catch (err) {
      toast.error(err.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card rw-card">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <span className="card-title">Trade {symbol || '—'}</span>
      </div>

      {/* Buy / Sell toggle */}
      <div className="rw-side-toggle">
        <button
          className={`rw-side-btn${side === 'buy' ? ' rw-side-btn--buy active' : ''}`}
          onClick={() => setSide('buy')}
        >
          Buy
        </button>
        <button
          className={`rw-side-btn${side === 'sell' ? ' rw-side-btn--sell active' : ''}`}
          onClick={() => setSide('sell')}
        >
          Sell
        </button>
      </div>

      {/* Order type */}
      <div className="rw-field">
        <label className="rw-label">Order type</label>
        <select
          className="rw-select"
          value={orderType}
          onChange={e => setOrderType(e.target.value)}
        >
          {ORDER_TYPES.map(t => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Quantity */}
      <div className="rw-field">
        <label className="rw-label">Shares</label>
        <input
          type="number"
          className="rw-input"
          min="1"
          step="1"
          value={qty}
          onChange={e => setQty(e.target.value)}
        />
      </div>

      {/* Limit / stop price */}
      {(needsLimit || needsStop) && (
        <div className="rw-field">
          <label className="rw-label">{needsLimit ? 'Limit price' : 'Stop price'}</label>
          <input
            type="number"
            className="rw-input"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
          />
        </div>
      )}

      <button
        className={`rw-submit-btn${side === 'sell' ? ' rw-submit-btn--sell' : ''}`}
        onClick={handlePlaceOrder}
        disabled={!symbol || submitting}
      >
        {submitting ? 'Placing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || '—'}`}
      </button>

      {/* Options ideas shortcut */}
      {onNavigateOptions && (
        <button
          className="rw-options-link"
          onClick={() => { onSetSymbol?.(symbol); onNavigateOptions('options'); }}
        >
          View options ideas ↗
        </button>
      )}
    </section>
  );
}
