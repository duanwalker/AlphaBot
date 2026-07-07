import { useEffect, useMemo, useState } from 'react';
import useHistoricalData from '../hooks/useHistoricalData';
import { fetchJson } from '../utils/fetchJson';

function fmtMoney(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '--';
}

function fmtSignedMoney(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
}

function fmtSignedPct(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPct1(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '--';
}

// Alpha Vantage fraction fields (ProfitMargin, DividendYield, ...) come back as
// decimals like "0.0044" rather than already-scaled percentages.
function fmtFractionPct(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : '--';
}

function fmtDate(v) {
  if (!v || v === 'None' || v === '-') return '--';
  return v;
}

function formatVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '--';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function getChgClass(n) {
  if (!Number.isFinite(n)) return '';
  return n >= 0 ? 'opt-pos' : 'opt-neg';
}

// Annualized stdev of daily log returns over the trailing window — a
// standard realized/historical volatility estimate computable from the
// daily closes we already fetch for the sparkline chart.
function computeRealizedVol(candles, days = 21) {
  if (!candles || candles.length < 2) return null;
  const slice = candles.slice(-Math.min(days + 1, candles.length));
  const returns = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]?.close;
    const cur = slice[i]?.close;
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0 && cur > 0) {
      returns.push(Math.log(cur / prev));
    }
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function computeAvgVolume(candles, days = 21) {
  if (!candles || candles.length === 0) return null;
  const slice = candles.slice(-Math.min(days, candles.length));
  const vols = slice.map(c => Number(c.volume)).filter(Number.isFinite);
  if (vols.length === 0) return null;
  return vols.reduce((a, b) => a + b, 0) / vols.length;
}

export default function OptionsFundamentalsCard({ symbol, spotPrice, atmIV }) {
  const [collapsed, setCollapsed] = useState(false);
  const [fundamentals, setFundamentals] = useState(null);
  const [dayChange, setDayChange] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const { candles } = useHistoricalData(symbol, '1mo');

  useEffect(() => {
    setFundamentals(null);
    setDayChange(null);
    setLoadError(null);
    if (!symbol) return;
    let cancelled = false;

    fetchJson(`/api/fundamentals/${symbol}`)
      .then(data => { if (!cancelled) setFundamentals(data); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });

    fetchJson(`/api/market/quote/${symbol}`)
      .then(quote => {
        if (cancelled) return;
        const change = parseFloat(quote['09. change']);
        const changePercent = parseFloat(String(quote['10. change percent'] || '').replace('%', ''));
        setDayChange({
          change: Number.isFinite(change) ? change : null,
          changePercent: Number.isFinite(changePercent) ? changePercent : null,
        });
      })
      .catch(err => { if (!cancelled) setLoadError(err.message); });

    return () => { cancelled = true; };
  }, [symbol]);

  const realizedVol = useMemo(() => computeRealizedVol(candles), [candles]);
  const avgVolume = useMemo(() => computeAvgVolume(candles), [candles]);

  if (!symbol) return null;

  const cells = [
    { label: 'Price', value: fmtMoney(spotPrice) },
    { label: 'Day Chg', value: fmtSignedMoney(dayChange?.change), cls: getChgClass(dayChange?.change) },
    { label: 'Day Chg %', value: fmtSignedPct(dayChange?.changePercent), cls: getChgClass(dayChange?.changePercent) },
    { label: 'IV (ATM)', value: Number.isFinite(atmIV) ? `${(atmIV * 100).toFixed(1)}%` : '--' },
    { label: 'Hist. Vol (1mo)', value: fmtPct1(realizedVol) },
    { label: '52W High', value: fmtMoney(fundamentals?.week52High) },
    { label: '52W Low', value: fmtMoney(fundamentals?.week52Low) },
    { label: 'Avg Volume', value: formatVolume(avgVolume) },
    { label: 'Beta', value: fundamentals?.beta != null ? parseFloat(fundamentals.beta).toFixed(2) || '--' : '--' },
    { label: 'Div Yield', value: fundamentals?.dividendYield ? fmtFractionPct(fundamentals.dividendYield) : '--' },
    { label: 'Ex-Div Date', value: fmtDate(fundamentals?.exDividendDate) },
  ];

  return (
    <div className={`opt-fund-card${collapsed ? ' opt-fund-card--collapsed' : ''}`}>
      <div className="opt-fund-header">
        <span className="opt-fund-title">Fundamentals{symbol ? ` — ${symbol}` : ''}</span>
        <button
          className="opt-fund-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Expand ▾' : 'Collapse ▴'}
        </button>
      </div>

      {!collapsed && loadError && (
        <div className="opt-fund-error">{loadError}</div>
      )}

      {!collapsed && (
        <div className="opt-fund-grid">
          {cells.map(({ label, value, cls }) => (
            <div key={label} className="opt-fund-cell">
              <div className="opt-fund-label">{label}</div>
              <div className={`opt-fund-value${cls ? ` ${cls}` : ''}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
