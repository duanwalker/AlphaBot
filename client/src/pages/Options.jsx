import { useState, useEffect, useMemo } from 'react';
import WheelTracker from '../components/WheelTracker';
import OptionsFundamentalsCard from '../components/OptionsFundamentalsCard';
import { useSymbol } from '../context/SymbolContext';
import useQuote from '../hooks/useQuote';
import { fetchJson } from '../utils/fetchJson';

// ── Helpers ──────────────────────────────────────────────────

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
  const strikeMap = {};

  for (const c of (data.results || [])) {
    const strike = c.strike || 0;
    const type = c.contractType === 'call' ? 'C' : 'P';

    if (!strikeMap[strike]) strikeMap[strike] = { strike, call: null, put: null };

    const row = {
      symbol:     c.symbol,
      bid:        c.bid,
      ask:        c.ask,
      last:       c.last,
      chg:        null,
      chgPct:     null,
      vol:        c.volume,
      oi:         c.openInterest,
      iv:         c.impliedVolatility,
      delta:      c.greeks?.delta ?? null,
      gamma:      c.greeks?.gamma ?? null,
      theta:      c.greeks?.theta ?? null,
      vega:       c.greeks?.vega  ?? null,
      rho:        null,
      expiration: c.expiry,
      type,
      strikeVal:  strike,
    };

    if (type === 'C') strikeMap[strike].call = row;
    else              strikeMap[strike].put  = row;
  }

  return Object.values(strikeMap).sort((a, b) => a.strike - b.strike);
}

// ── Current price marker ────────────────────────────────────────
// Finds the index (0..rows.length) at which a marker row should be
// inserted so it sits between the two strike rows bracketing the live
// underlying price. Returns null when the price is absent or outside
// the range of listed strikes (no marker rendered in that case).
function getMarkerIndex(rows, spotPrice) {
  if (!rows.length || spotPrice == null) return null;
  if (spotPrice < rows[0].strike || spotPrice > rows[rows.length - 1].strike) return null;

  let lowerIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].strike <= spotPrice) lowerIdx = i;
    else break;
  }
  return lowerIdx + 1;
}

// Interleaves a marker placeholder into the row list at markerIndex so
// callers can render it as a real <tr> alongside the strike rows.
function withMarker(rows, markerIndex) {
  const items = [];
  rows.forEach((row, i) => {
    if (markerIndex === i) items.push({ marker: true });
    items.push({ marker: false, row });
  });
  if (markerIndex === rows.length) items.push({ marker: true });
  return items;
}

function MarkerRow({ spotPrice, colSpan }) {
  return (
    <tr className="opt-row-marker">
      <td colSpan={colSpan} className="opt-row-marker-cell">
        Current: ${spotPrice.toFixed(2)}
      </td>
    </tr>
  );
}

// ── Chain Table ───────────────────────────────────────────────

function ChainTable({ rows, chainView, selectedContract, onContractClick, spotPrice }) {
  const markerIndex = spotPrice != null ? getMarkerIndex(rows, spotPrice) : null;
  const renderRows = markerIndex != null ? withMarker(rows, markerIndex) : rows.map(row => ({ marker: false, row }));
  let table;

  if (chainView === 'calls') {
    table = (
      <table className="opt-table">
        <thead>
          <tr>
            <th>Bid</th><th>Ask</th><th>Last</th><th>Chg</th><th>Chg%</th>
            <th>Vol</th><th>OI</th><th>Δ</th><th>Γ</th><th>Θ</th><th>V</th><th>ρ</th>
            <th className="opt-strike-col">Strike</th>
          </tr>
        </thead>
        <tbody>
          {renderRows.map((item, i) => {
            if (item.marker) return <MarkerRow key={`marker-${i}`} spotPrice={spotPrice} colSpan={13} />;
            const row = item.row;
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
  } else if (chainView === 'puts') {
    table = (
      <table className="opt-table">
        <thead>
          <tr>
            <th className="opt-strike-col">Strike</th>
            <th>Bid</th><th>Ask</th><th>Last</th><th>Chg</th><th>Chg%</th>
            <th>Vol</th><th>OI</th><th>Δ</th><th>Γ</th><th>Θ</th><th>V</th><th>ρ</th>
          </tr>
        </thead>
        <tbody>
          {renderRows.map((item, i) => {
            if (item.marker) return <MarkerRow key={`marker-${i}`} spotPrice={spotPrice} colSpan={13} />;
            const row = item.row;
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
  } else {
    // Both view
    table = (
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
          {renderRows.map((item, i) => {
            if (item.marker) return <MarkerRow key={`marker-${i}`} spotPrice={spotPrice} colSpan={11} />;
            const row = item.row;
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

  return table;
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
      `Ask: $${fmt2(selectedContract.ask)} | ${orderSide === 'sell' ? 'Est. credit' : 'Est. cost'}: $${estCost.toFixed(2)} | Break-even: $${breakEven?.toFixed(2) ?? '--'}\n` +
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
            <span className="opt-stat-label">{orderSide === 'sell' ? 'Est. credit' : 'Est. cost'}</span>
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

export default function Options({ setShowAssistant, setExternalPrompt }) {
  const { symbol, setSymbol }               = useSymbol();
  const { price: spotPrice }                = useQuote(symbol);
  const [optionsView, setOptionsView]       = useState('chain');
  const [inputValue, setInputValue]         = useState(symbol || '');
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

  // Fetch available expirations when symbol changes
  useEffect(() => {
    setError(null);
    setOptionsUnavailable(false);
    setExpirations([]);
    setSelectedExpiration('');
    setRows([]);
    setSelectedContract(null);

    if (!symbol) return;
    let cancelled = false;
    setLoadingExps(true);

    fetchJson(`/api/options/expirations/${symbol}`)
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

    fetchJson(`/api/options/chain/${symbol}?expiration=${selectedExpiration}`)
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

  // ATM IV: average of the call/put IV at the strike closest to spot,
  // computed from the chain response already loaded for the table —
  // no separate IV endpoint needed.
  const atmIV = useMemo(() => {
    if (!rows.length || spotPrice == null) return null;
    let closest = null;
    let minDiff = Infinity;
    for (const row of rows) {
      const diff = Math.abs(row.strike - spotPrice);
      if (diff < minDiff) { minDiff = diff; closest = row; }
    }
    if (!closest) return null;
    const ivs = [closest.call?.iv, closest.put?.iv]
      .map(v => parseFloat(v))
      .filter(v => Number.isFinite(v) && v > 0);
    if (ivs.length === 0) return null;
    return ivs.reduce((a, b) => a + b, 0) / ivs.length;
  }, [rows, spotPrice]);

  return (
    <div className="opt-page">
      {/* ── Inner tab bar ── */}
      <div className="options-inner-tabs">
        <button
          className={`options-inner-tab${optionsView === 'chain' ? ' active' : ''}`}
          onClick={() => setOptionsView('chain')}
        >
          Options Chain
        </button>
        <button
          className={`options-inner-tab${optionsView === 'wheel' ? ' active' : ''}`}
          onClick={() => setOptionsView('wheel')}
        >
          Wheel Tracker
        </button>
      </div>

      {optionsView === 'wheel' && (
        <div className="wheel-page-wrap">
          <WheelTracker />
        </div>
      )}

      {optionsView === 'chain' && (
      <>
      <OptionsFundamentalsCard symbol={symbol} spotPrice={spotPrice} atmIV={atmIV} />
      <div className="opt-layout">
      {/* ── Left: chain panel ── */}
      <div className="opt-left">
        <div className="opt-search-row">
          <form className="opt-search-form" onSubmit={handleSearch}>
            <input
              className="opt-search-input"
              value={inputValue}
              onChange={e => {
                const val = e.target.value;
                setInputValue(val);
                if (!val.trim()) setSymbol(null);
              }}
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
              <div className="opt-account-notice-title">Options chain data unavailable for {symbol}</div>
              <div className="opt-account-notice-body">
                This symbol may not have listed options, or the data is temporarily unavailable.
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="opt-empty">
              {symbol ? `No options data for ${symbol}. Try a different expiration.` : 'Enter a symbol above to see options for it.'}
            </div>
          ) : (
            <div className="opt-table-scroll">
              <ChainTable
                rows={rows}
                chainView={chainView}
                selectedContract={selectedContract}
                onContractClick={handleContractClick}
                spotPrice={spotPrice}
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
      </>
      )}
    </div>
  );
}
