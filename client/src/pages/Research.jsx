import { useState, useEffect } from 'react';
import useSymbolSearch from '../hooks/useSymbolSearch';
import HistoricalSparklineCard from '../components/HistoricalSparklineCard';
import ResearchSentimentPanel from '../components/sentiment/ResearchSentimentPanel';
import RelevantArticlesPanel from '../components/news/RelevantArticlesPanel';
import ResearchTradeWidget from '../components/ResearchTradeWidget';
import SentimentBadge from '../components/sentiment/SentimentBadge';

const DEFAULT_SYMBOL = 'AAPL';

function formatLargeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '--';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function formatPct(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '--';
  return `${(n * 100).toFixed(1)}%`;
}

function fmt(value, prefix = '', suffix = '') {
  if (value === 'None' || value == null) return '--';
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '--';
  return `${prefix}${n.toFixed(2)}${suffix}`;
}

function fmtStr(value) {
  if (value == null || value === 'None' || value === '-' || value === '') return '--';
  return value;
}

function FundamentalsGrid({ symbol }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);  // start loading — there is always a default symbol
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!symbol) return;

    console.log('[DEBUG] Fetching fundamentals for:', symbol);
    console.log('[DEBUG] symbol at fetch time:', symbol);

    let cancelled = false;
    setLoading(true);
    setData(null);
    setFetchError(null);

    fetch(`/api/fundamentals/${symbol}`)
      .then(async r => {
        if (!r.ok) throw new Error(`Fundamentals fetch failed (${r.status})`);
        return r.json();
      })
      .then(d => {
        console.log('[DEBUG] Raw response for', symbol, ':', d);
        console.log('[DEBUG] Keys received:', Object.keys(d || {}));
        if (!cancelled) setData(d);
      })
      .catch(err => {
        console.error('[DEBUG] Fetch error:', err);
        if (!cancelled) setFetchError(err.message || 'Failed to load fundamentals');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [symbol]);

  const cells = [
    { label: 'P/E Ratio',      value: fmt(data?.peRatio) },
    { label: 'EPS',            value: fmt(data?.eps, '$') },
    { label: '52W High',       value: fmt(data?.week52High, '$') },
    { label: '52W Low',        value: fmt(data?.week52Low, '$') },
    { label: 'Beta',           value: fmt(data?.beta) },
    { label: 'Market Cap',     value: formatLargeNumber(data?.marketCap) },
    { label: 'Profit Margin',  value: formatPct(data?.profitMargin) },
    { label: 'Sector',         value: fmtStr(data?.sector) },
    { label: 'Industry',       value: fmtStr(data?.industry) },
  ];

  return (
    <section className="card">
      <div className="card-header" style={{ marginBottom: 10 }}>
        <span className="card-title">Fundamentals</span>
      </div>

      {loading ? (
        <div className="res-fund-skeleton">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="res-fund-skeleton-cell" />
          ))}
        </div>
      ) : fetchError ? (
        <p className="res-fund-error">{fetchError}</p>
      ) : (
        <div className="res-fund-grid">
          {cells.map(({ label, value }) => (
            <div key={label} className="res-fund-cell">
              <div className="res-fund-label">{label}</div>
              <div className="res-fund-value">{value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SymbolHeader({ symbol, searchResult }) {
  const name     = searchResult?.name     || searchResult?.companyName || symbol;
  const exchange = searchResult?.exchange || searchResult?.region      || '';
  const price    = searchResult?.price;
  const score    = searchResult?.sentimentScore != null
    ? (searchResult.sentimentScore + 1) * 50
    : null;

  return (
    <div className="res-sym-header">
      <div className="res-sym-main">
        <span className="res-sym-ticker">{symbol}</span>
        {name && name !== symbol && (
          <span className="res-sym-name">{name}</span>
        )}
        {exchange && <span className="res-sym-exchange">{exchange}</span>}
      </div>
      <div className="res-sym-right">
        {price != null && (
          <span className="res-sym-price">${Number(price).toFixed(2)}</span>
        )}
        {score != null && <SentimentBadge score={score} />}
      </div>
    </div>
  );
}

export default function Research({ onNavigate, setActiveSymbol: setAppSymbol, refetchOrders }) {
  const [inputValue, setInputValue]   = useState('');
  const [activeSymbol, setActiveSymbol] = useState(DEFAULT_SYMBOL);
  const { loading: searching, error: searchError, result, searchSymbol } = useSymbolSearch();

  // Sync local symbol up to AppShell so AssistantPanel overlay gets it
  useEffect(() => {
    setAppSymbol?.(activeSymbol);
  }, [activeSymbol, setAppSymbol]);

  function handleSearch(e) {
    e.preventDefault();
    const sym = inputValue.trim().toUpperCase();
    if (!sym) return;
    console.log('[DEBUG] setSymbol called with:', sym);
    setActiveSymbol(sym);
    searchSymbol(sym);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch(e);
  }

  return (
    <div className="res-layout">
      {/* ── Left column ── */}
      <div className="res-left">
        {/* Search bar */}
        <div className="res-search-row">
          <input
            className="res-search-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbol… e.g. TSLA"
          />
          <button
            className="res-search-btn"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searchError && (
          <p className="res-search-error">{searchError}</p>
        )}

        {/* Symbol header */}
        <SymbolHeader symbol={activeSymbol} searchResult={result} />

        {/* Price chart */}
        <HistoricalSparklineCard symbol={activeSymbol} />

        {/* Fundamentals */}
        <FundamentalsGrid symbol={activeSymbol} />

        {/* News */}
        <RelevantArticlesPanel symbol={activeSymbol} />
      </div>

      {/* ── Right column ── */}
      <div className="res-right">
        <ResearchSentimentPanel symbol={activeSymbol} />
        <ResearchTradeWidget
          symbol={activeSymbol}
          onNavigateOptions={onNavigate}
          onSetSymbol={setAppSymbol}
          refetchOrders={refetchOrders}
        />
      </div>
    </div>
  );
}
