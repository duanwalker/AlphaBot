import { useState, useEffect } from 'react';
import useToast from '../hooks/useToast';

const ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'];

export default function ResearchTradeWidget({ symbol, onNavigateOptions, onSetSymbol, refetchOrders }) {
  const [side, setSide]           = useState('buy');
  const [qty, setQty]             = useState(1);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [buyingPower, setBuyingPower] = useState(null);
  const { toast } = useToast();

  const needsLimit = orderType === 'limit' || orderType === 'stop_limit';
  const needsStop  = orderType === 'stop'  || orderType === 'stop_limit';

  // Fetch live price: Alpaca NBBO (ap/ask) → Alpha Vantage fallback
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setCurrentPrice(null);
    setPriceLoading(true);

    async function fetchPrice() {
      try {
        // Primary: Alpaca quote — ap = ask price, bp = bid price
        const r1 = await fetch(`/api/alpaca/quote/${symbol}`);
        const d1 = await r1.json();
        const alpacaPrice = d1?.ap ?? d1?.ask ?? d1?.bp ?? d1?.bid ?? null;

        if (alpacaPrice != null && parseFloat(alpacaPrice) > 0) {
          if (!cancelled) setCurrentPrice(parseFloat(alpacaPrice));
          return;
        }

        // Fallback: Alpha Vantage Global Quote (works outside market hours)
        const r2 = await fetch(`/api/market/quote/${symbol}`);
        const d2 = await r2.json();
        const fallbackPrice = d2?.['05. price'] ? parseFloat(d2['05. price']) : null;
        if (!cancelled) setCurrentPrice(fallbackPrice);
      } catch {
        if (!cancelled) setCurrentPrice(null);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    }

    fetchPrice();
    return () => { cancelled = true; };
  }, [symbol]);

  // Fetch account buying power once on mount
  useEffect(() => {
    fetch('/api/alpaca/account')
      .then(r => r.json())
      .then(data => {
        const bp = data?.buying_power ?? null;
        setBuyingPower(bp != null ? parseFloat(bp) : null);
      })
      .catch(() => {});
  }, []);

  const parsedQty = parseFloat(qty);
  const estimatedCost = currentPrice && parsedQty > 0
    ? currentPrice * parsedQty
    : null;

  const fmtCurrency = n =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const insufficientFunds =
    estimatedCost != null && buyingPower != null && side === 'buy' &&
    estimatedCost > buyingPower;

  async function placeOrder() {
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
      setConfirming(false);
      refetchOrders?.();
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

      {confirming ? (
        /* ── Step 2: confirmation panel ── */
        <div className="rw-confirm-panel">
          <div className="rw-confirm-title">Confirm Order</div>

          <div className="rw-confirm-row rw-confirm-row--bold">
            {side === 'buy' ? 'Buy' : 'Sell'} {qty} {Number(qty) === 1 ? 'share' : 'shares'} of {symbol}
          </div>

          <div className="rw-confirm-row">
            Order type: {orderType.replace('_', ' ')}
          </div>

          {estimatedCost != null && (
            <div className={`rw-confirm-row${insufficientFunds ? ' rw-confirm-row--warn' : ''}`}>
              Est. cost: {fmtCurrency(estimatedCost)}
              {insufficientFunds && (
                <span className="rw-warn-badge"> ⚠ Insufficient buying power</span>
              )}
            </div>
          )}

          {buyingPower != null && (
            <div className="rw-confirm-row rw-confirm-row--muted">
              Available buying power: {fmtCurrency(buyingPower)}
            </div>
          )}

          <div className="rw-confirm-actions">
            <button
              className="rw-cancel-btn"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className={`rw-confirm-btn${side === 'sell' ? ' rw-confirm-btn--sell' : ''}`}
              onClick={placeOrder}
              disabled={submitting || !symbol}
            >
              {submitting ? 'Placing…' : 'Confirm & place order'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Step 1: order entry form ── */
        <>
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

          {/* Estimated cost */}
          <div className="rw-cost-row">
            {priceLoading ? (
              <div className="rw-cost-unavail">Loading price…</div>
            ) : estimatedCost != null ? (
              <>
                <div className={`rw-cost-est${insufficientFunds ? ' rw-cost-est--warn' : ''}`}>
                  Est. cost: {fmtCurrency(estimatedCost)}
                  <span className="rw-price-per-share"> · ~{fmtCurrency(currentPrice)}/share</span>
                  {insufficientFunds && (
                    <span className="rw-warn-badge"> ⚠ Insufficient buying power</span>
                  )}
                </div>
                {buyingPower != null && (
                  <div className="rw-cost-bp">Buying power: {fmtCurrency(buyingPower)}</div>
                )}
              </>
            ) : symbol ? (
              <div className="rw-cost-unavail">Price unavailable</div>
            ) : null}
          </div>

          <button
            className={`rw-submit-btn${side === 'sell' ? ' rw-submit-btn--sell' : ''}`}
            onClick={() => setConfirming(true)}
            disabled={!symbol || submitting}
          >
            Review &amp; place order
          </button>
        </>
      )}

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
