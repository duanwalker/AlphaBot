import { useState, useEffect } from 'react';

// ── Helpers ──────────────────────────────────────────────────

function parseContractSymbol(sym) {
  // e.g. "AAPL260116C00150000" → { underlying, expiration, type, strike }
  const m = sym.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  const [, underlying, expStr, type, strikeStr] = m;
  const year  = 2000 + parseInt(expStr.slice(0, 2), 10);
  const month = parseInt(expStr.slice(2, 4), 10);
  const day   = parseInt(expStr.slice(4, 6), 10);
  const strike = parseInt(strikeStr, 10) / 1000;
  const expiration = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { underlying, expiration, type, strike };
}

function fmt2(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}

function fmt4(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(4) : '--';
}

function fmtPct(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '--';
}

function fmtChg(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '--';
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function calcDTE(expDate) {
  if (!expDate) return '--';
  const exp = new Date(expDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((exp - now) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : '--';
}

function getChgClass(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '';
  return n >= 0 ? 'opt-pos' : 'opt-neg';
}

function processChain(data) {
  const snapshots = data.snapshots || {};
  const strikeMap = {};

  for (const [contractSym, snap] of Object.entries(snapshots)) {
    const parsed = parseContractSymbol(contractSym);
    if (!parsed) continue;
    const { strike, type } = parsed;

    if (!strikeMap[strike]) strikeMap[strike] = { strike, call: null, put: null };

    const prevClose = snap.prevDailyBar?.c;
    const currClose = snap.dailyBar?.c;

    const row = {
      symbol:     contractSym,
      bid:        snap.latestQuote?.bp,
      ask:        snap.latestQuote?.ap,
      last:       snap.latestTrade?.p,
      chg:        currClose != null && prevClose != null ? currClose - prevClose : null,
      chgPct:     currClose != null && prevClose ? (currClose - prevClose) / prevClose : null,
      vol:        snap.dailyBar?.v,
      oi:         snap.openInterest,
      iv:         snap.impliedVolatility,
      delta:      snap.greeks?.delta,
      gamma:      snap.greeks?.gamma,
      theta:      snap.greeks?.theta,
      vega:       snap.greeks?.vega,
      rho:        snap.greeks?.rho,
      expiration: parsed.expiration,
      type,
      strikeVal:  strike,
    };

    if (type === 'C') strikeMap[strike].call = row;
    else              strikeMap[strike].put  = row;
  }

  return Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
}

// ── Chain Table ───────────────────────────────────────────────

function ChainTable({ rows, chainView, selectedContract, onContractClick }) {
  if (chainView === 'calls') {
    return (
      <table className="opt-table">
        <thead>
          <tr>
            <th>Bid</th><th>Ask</th><th>Last</th><th>Chg</th><th>Chg%</th>
            <th>Vol</th><th>OI</th><th>Δ</th><th>Γ</th><th>Θ</th><th>V</th><th>ρ</th>
            <th className="opt-strike-col">Strike</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const c = row.call;
            const isSel = selectedContract?.symbol === c?.symbol;
            return (
              <tr
                key={row.strike}
                className={`opt-row opt-row-call${isSel ? ' selected' : ''}${c ? '' : ' opt-row-empty'}`}
                onClick={() => c && onContractClick(c)}
              >
                <td>{fmt2(c?.bid)}</td>
                <td>{fmt2(c?.ask)}</td>
                <td>{fmt2(c?.last)}</td>
                <td className={getChgClass(c?.chg)}>{fmtChg(c?.chg)}</td>
                <td className={getChgClass(c?.chgPct)}>{fmtPct(c?.chgPct)}</td>
                <td>{c?.vol ?? '--'}</td>
                <td>{c?.oi ?? '--'}</td>
                <td>{fmt4(c?.delta)}</td>
                <td>{fmt4(c?.gamma)}</td>
                <td>{fmt4(c?.theta)}</td>
                <td>{fmt4(c?.vega)}</td>
                <td>{fmt4(c?.rho)}</td>
                <td className="opt-strike-col">${row.strike.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (chainView === 'puts') {
    return (
      <table className="opt-table">
        <thead>
          <tr>
            <th className="opt-strike-col">Strike</th>
            <th>Bid</th><th>Ask</th><th>Last</th><th>Chg</th><th>Chg%</th>
            <th>Vol</th><th>OI</th><th>Δ</th><th>Γ</th><th>Θ</th><th>V</th><th>ρ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const p = row.put;
            const isSel = selectedContract?.symbol === p?.symbol;
            return (
              <tr
                key={row.strike}
                className={`opt-row opt-row-put${isSel ? ' selected' : ''}${p ? '' : ' opt-row-empty'}`}
                onClick={() => p && onContractClick(p)}
              >
                <td className="opt-strike-col">${row.strike.toFixed(2)}</td>
                <td>{fmt2(p?.bid)}</td>
                <td>{fmt2(p?.ask)}</td>
                <td>{fmt2(p?.last)}</td>
                <td className={getChgClass(p?.chg)}>{fmtChg(p?.chg)}</td>
                <td className={getChgClass(p?.chgPct)}>{fmtPct(p?.chgPct)}</td>
                <td>{p?.vol ?? '--'}</td>
                <td>{p?.oi ?? '--'}</td>
                <td>{fmt4(p?.delta)}</td>
                <td>{fmt4(p?.gamma)}</td>
                <td>{fmt4(p?.theta)}</td>
                <td>{fmt4(p?.vega)}</td>
                <td>{fmt4(p?.rho)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // Both view
  return (
    <table className="opt-table opt-table-both">
      <thead>
        <tr>
          <th colSpan={5} className="opt-th-calls">Calls</th>
          <th className="opt-strike-col">Strike</th>
          <th colSpan={5} className="opt-th-puts">Puts</th>
        </tr>
        <tr>
          <th>Bid</th><th>Ask</th><th>Δ</th><th>Chg%</th><th>OI</th>
          <th className="opt-strike-col"></th>
          <th>Bid</th><th>Ask</th><th>Δ</th><th>Chg%</th><th>OI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const c = row.call;
          const p = row.put;
          const callSel = selectedContract?.symbol === c?.symbol;
          const putSel  = selectedContract?.symbol === p?.symbol;
          return (
            <tr key={row.strike} className="opt-row opt-row-both">
              <td className={`opt-call-cell${callSel ? ' selected' : ''}`} onClick={() => c && onContractClick(c)}>{fmt2(c?.bid)}</td>
              <td className={`opt-call-cell${callSel ? ' selected' : ''}`} onClick={() => c && onContractClick(c)}>{fmt2(c?.ask)}</td>
              <td className={`opt-call-cell${callSel ? ' selected' : ''}`} onClick={() => c && onContractClick(c)}>{fmt4(c?.delta)}</td>
              <td className={`opt-call-cell${callSel ? ' selected' : ''}`} onClick={() => c && onContractClick(c)}>{fmtPct(c?.chgPct)}</td>
              <td className={`opt-call-cell${callSel ? ' selected' : ''}`} onClick={() => c && onContractClick(c)}>{c?.oi ?? '--'}</td>
              <td className="opt-strike-col">${row.strike.toFixed(2)}</td>
              <td className={`opt-put-cell${putSel ? ' selected' : ''}`} onClick={() => p && onContractClick(p)}>{fmt2(p?.bid)}</td>
              <td className={`opt-put-cell${putSel ? ' selected' : ''}`} onClick={() => p && onContractClick(p)}>{fmt2(p?.ask)}</td>
              <td className={`opt-put-cell${putSel ? ' selected' : ''}`} onClick={() => p && onContractClick(p)}>{fmt4(p?.delta)}</td>
              <td className={`opt-put-cell${putSel ? ' selected' : ''}`} onClick={() => p && onContractClick(p)}>{fmtPct(p?.chgPct)}</td>
              <td className={`opt-put-cell${putSel ? ' selected' : ''}`} onClick={() => p && onContractClick(p)}>{p?.oi ?? '--'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Order Ticket ──────────────────────────────────────────────

function OrderTicket({
  symbol, selectedContract,
  orderSide, setOrderSide, orderQty, setOrderQty, orderType, setOrderType,
  midPrice, estCost, breakEven,
  onSendToAlphaBot,
}) {
  const dte = selectedContract ? calcDTE(selectedContract.expiration) : '--';
  const contractLabel = selectedContract
    ? `${symbol} $${selectedContract.strikeVal.toFixed(0)} ${selectedContract.type === 'C' ? 'Call' : 'Put'} ${selectedContract.expiration}`
    : null;

  function handleReviewClick() {
    if (!selectedContract) return;
    const typeLabel = selectedContract.type === 'C' ? 'Call' : 'Put';
    const prompt =
      `Please review this options order before I place it:\n` +
      `${orderSide === 'buy' ? 'Buy to open' : 'Sell to open'} ${orderQty} contract(s) of ` +
      `${symbol} $${selectedContract.strikeVal.toFixed(0)} ${typeLabel} expiring ${selectedContract.expiration} (${dte} DTE)\n` +
      `Ask: $${fmt2(selectedContract.ask)} | Est. cost: $${estCost.toFixed(2)} | Break-even: $${breakEven?.toFixed(2) ?? '--'}\n` +
      `Greeks — Delta: ${fmt4(selectedContract.delta)}, Theta: ${fmt4(selectedContract.theta)}/day, IV: ${fmtPct(selectedContract.iv)}\n\n` +
      `Should I place this order? What are the key risks?`;
    onSendToAlphaBot(prompt);
  }

  return (
    <div className="opt-ticket">
      <div className="opt-ticket-header">
        <span className="opt-ticket-title">Order Ticket</span>
        {selectedContract && (
          <span className={`opt-contract-badge opt-contract-badge--${selectedContract.type === 'C' ? 'call' : 'put'}`}>
            {selectedContract.type === 'C' ? 'Call' : 'Put'}
          </span>
        )}
      </div>

      {/* Buy / Sell toggle */}
      <div className="opt-side-toggle">
        <button
          className={`opt-side-btn opt-side-btn--buy${orderSide === 'buy' ? ' active' : ''}`}
          onClick={() => setOrderSide('buy')}
        >
          Buy to open
        </button>
        <button
          className={`opt-side-btn opt-side-btn--sell${orderSide === 'sell' ? ' active' : ''}`}
          onClick={() => setOrderSide('sell')}
        >
          Sell to open
        </button>
      </div>

      {/* Selected contract */}
      {contractLabel
        ? <div className="opt-contract-display">{contractLabel}</div>
        : <div className="opt-contract-placeholder">Select a contract from the chain ←</div>
      }

      {/* Contracts + order type */}
      <div className="opt-ticket-row">
        <div className="opt-ticket-field">
          <label className="opt-field-label">Contracts</label>
          <input
            className="opt-field-input"
            type="number"
            min={1}
            value={orderQty}
            onChange={e => setOrderQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
        <div className="opt-ticket-field">
          <label className="opt-field-label">Order type</label>
          <select
            className="opt-field-select"
            value={orderType}
            onChange={e => setOrderType(e.target.value)}
          >
            <option value="limit">Limit (mid)</option>
            <option value="market">Market</option>
          </select>
        </div>
      </div>

      {/* Cost / break-even summary */}
      {selectedContract && (
        <div className="opt-ticket-stats">
          <div className="opt-stat">
            <span className="opt-stat-label">Mid price</span>
            <span className="opt-stat-value">${midPrice.toFixed(2)}</span>
          </div>
          <div className="opt-stat">
            <span className="opt-stat-label">Est. cost</span>
            <span className="opt-stat-value">${estCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="opt-stat">
            <span className="opt-stat-label">Break-even</span>
            <span className="opt-stat-value">${breakEven?.toFixed(2) ?? '--'}</span>
          </div>
        </div>
      )}

      {/* Greeks */}
      {selectedContract && (
        <div className="opt-greeks">
          <div className="opt-greeks-title">Greeks</div>
          <div className="opt-greeks-grid">
            <div className="opt-greek"><span>Δ Delta</span><strong>{fmt4(selectedContract.delta)}</strong></div>
            <div className="opt-greek"><span>Γ Gamma</span><strong>{fmt4(selectedContract.gamma)}</strong></div>
            <div className="opt-greek"><span>Θ Theta/day</span><strong>{fmt4(selectedContract.theta)}</strong></div>
            <div className="opt-greek"><span>V Vega /1%IV</span><strong>{fmt4(selectedContract.vega)}</strong></div>
            <div className="opt-greek"><span>ρ Rho</span><strong>{fmt4(selectedContract.rho)}</strong></div>
            <div className="opt-greek"><span>DTE</span><strong>{dte}</strong></div>
          </div>
        </div>
      )}

      {/* Action area */}
      <div className="opt-ticket-actions">
        <button
          className="opt-review-btn"
          onClick={handleReviewClick}
          disabled={!selectedContract}
        >
          Review &amp; place order ↗
        </button>
      </div>

      {/* AlphaBot integration cards */}
      <div className="opt-ai-cards">
        <button
          className="opt-ai-card"
          disabled={!selectedContract}
          onClick={() => selectedContract && onSendToAlphaBot(
            `Suggest options strategies for ${symbol}. Current IV: ${fmtPct(selectedContract.iv)}, DTE: ${dte}. ` +
            `Consider earnings timing, sentiment, and the current trend.`
          )}
        >
          <span className="opt-ai-card-icon">✦</span>
          <div className="opt-ai-card-body">
            <div className="opt-ai-card-title">Strategy ideas ↗</div>
            <div className="opt-ai-card-desc">IV + sentiment + earnings context</div>
          </div>
        </button>

        <button
          className="opt-ai-card"
          disabled={!selectedContract}
          onClick={() => selectedContract && onSendToAlphaBot(
            `Explain IV crush risk for the ${symbol} $${selectedContract.strikeVal} ` +
            `${selectedContract.type === 'C' ? 'Call' : 'Put'} expiring ${selectedContract.expiration}. ` +
            `Current IV: ${fmtPct(selectedContract.iv)}. When is the next earnings event and how much might IV compress after it?`
          )}
        >
          <span className="opt-ai-card-icon">✦</span>
          <div className="opt-ai-card-body">
            <div className="opt-ai-card-title">IV crush risk ↗</div>
            <div className="opt-ai-card-desc">Earnings &amp; volatility analysis</div>
          </div>
        </button>

        <button
          className="opt-ai-card"
          disabled={!selectedContract}
          onClick={() => selectedContract && onSendToAlphaBot(
            `Compare buying the ${symbol} $${selectedContract.strikeVal} ` +
            `${selectedContract.type === 'C' ? 'Call' : 'Put'} outright vs a spread strategy. ` +
            `Expiration: ${selectedContract.expiration} (${dte} DTE), mid price: $${midPrice.toFixed(2)}. ` +
            `Which approach is better given current IV of ${fmtPct(selectedContract.iv)}?`
          )}
        >
          <span className="opt-ai-card-icon">✦</span>
          <div className="opt-ai-card-body">
            <div className="opt-ai-card-title">Spread vs long option ↗</div>
            <div className="opt-ai-card-desc">Compare strategies &amp; cost basis</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function Options({ initialSymbol, setActiveSymbol: setAppSymbol, setShowAssistant, setExternalPrompt }) {
  const [inputValue, setInputValue]         = useState(initialSymbol || 'AAPL');
  const [symbol, setSymbol]                 = useState(initialSymbol || 'AAPL');
  const [chainView, setChainView]           = useState('calls');
  const [expirations, setExpirations]       = useState([]);
  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [rows, setRows]                     = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);
  const [orderSide, setOrderSide]           = useState('buy');
  const [orderQty, setOrderQty]             = useState(1);
  const [orderType, setOrderType]           = useState('limit');
  const [loadingExps, setLoadingExps]       = useState(false);
  const [loadingChain, setLoadingChain]     = useState(false);
  const [error, setError]                   = useState(null);
  const [optionsUnavailable, setOptionsUnavailable] = useState(false);

  // Sync symbol to AppShell → AssistantPanel gets the right context
  useEffect(() => { setAppSymbol?.(symbol); }, [symbol, setAppSymbol]);

  // Fetch available expirations when symbol changes
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoadingExps(true);
    setError(null);
    setOptionsUnavailable(false);
    setExpirations([]);
    setSelectedExpiration('');
    setRows([]);
    setSelectedContract(null);

    fetch(`/api/options/expirations/${symbol}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const exps = data.expirations || [];
        setExpirations(exps);
        if (exps.length > 0) {
          setSelectedExpiration(exps[0]);
        } else if (data.error || data.message) {
          setOptionsUnavailable(true);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingExps(false); });

    return () => { cancelled = true; };
  }, [symbol]);

  // Fetch chain when symbol or expiration changes
  useEffect(() => {
    if (!symbol || !selectedExpiration) return;
    let cancelled = false;
    setLoadingChain(true);
    setError(null);

    fetch(`/api/options/chain/${symbol}?expiration=${selectedExpiration}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setRows(processChain(data));
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingChain(false); });

    return () => { cancelled = true; };
  }, [symbol, selectedExpiration]);

  function handleSearch(e) {
    e.preventDefault();
    const sym = inputValue.trim().toUpperCase();
    if (sym) setSymbol(sym);
  }

  function handleContractClick(contract) {
    setSelectedContract(contract);
    setOrderSide('buy');
  }

  function sendToAlphaBot(promptText) {
    setShowAssistant?.(true);
    setExternalPrompt?.({ text: promptText, id: Date.now() });
  }

  const midPrice = selectedContract
    ? ((selectedContract.bid || 0) + (selectedContract.ask || 0)) / 2
    : 0;
  const estCost = midPrice * orderQty * 100;
  const breakEven = selectedContract
    ? selectedContract.type === 'C'
      ? selectedContract.strikeVal + midPrice
      : selectedContract.strikeVal - midPrice
    : null;

  return (
    <div className="opt-layout">
      {/* ── Left: chain panel ── */}
      <div className="opt-left">
        <div className="opt-search-row">
          <form className="opt-search-form" onSubmit={handleSearch}>
            <input
              className="opt-search-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Symbol… e.g. TSLA"
            />
            <button className="opt-search-btn" type="submit" disabled={loadingExps}>
              {loadingExps ? 'Loading…' : 'Load chain'}
            </button>
          </form>

          {expirations.length > 0 && (
            <select
              className="opt-exp-select"
              value={selectedExpiration}
              onChange={e => setSelectedExpiration(e.target.value)}
            >
              {expirations.map(exp => (
                <option key={exp} value={exp}>{exp}</option>
              ))}
            </select>
          )}

          <div className="opt-view-toggle">
            {['calls', 'both', 'puts'].map(v => (
              <button
                key={v}
                className={`opt-view-btn${chainView === v ? ' active' : ''}`}
                onClick={() => setChainView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="opt-error">{error}</div>}

        <div className="opt-chain-wrap">
          {loadingExps || loadingChain ? (
            <div className="opt-loading">Loading chain…</div>
          ) : optionsUnavailable ? (
            <div className="opt-account-notice">
              <div className="opt-account-notice-title">Options data unavailable for this account</div>
              <div className="opt-account-notice-body">
                Alpaca paper trading accounts require options trading to be enabled.
                Contact Alpaca support or upgrade your account to access live options data.
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="opt-empty">
              {symbol ? `No options data for ${symbol}. Try a different expiration.` : 'Enter a symbol to load the chain.'}
            </div>
          ) : (
            <div className="opt-table-scroll">
              <ChainTable
                rows={rows}
                chainView={chainView}
                selectedContract={selectedContract}
                onContractClick={handleContractClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Right: order ticket ── */}
      <div className="opt-right">
        <OrderTicket
          symbol={symbol}
          selectedContract={selectedContract}
          orderSide={orderSide}       setOrderSide={setOrderSide}
          orderQty={orderQty}         setOrderQty={setOrderQty}
          orderType={orderType}       setOrderType={setOrderType}
          midPrice={midPrice}
          estCost={estCost}
          breakEven={breakEven}
          onSendToAlphaBot={sendToAlphaBot}
        />
      </div>
    </div>
  );
}
