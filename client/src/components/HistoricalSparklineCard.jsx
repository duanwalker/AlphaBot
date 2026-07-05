import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import useHistoricalData from "../hooks/useHistoricalData";

const TIMEFRAMES = [
  { label: "1D", value: "1d" },
  { label: "5D", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
];

function formatPrice(value) {
  if (!Number.isFinite(Number(value))) return "--";
  return `$${Number(value).toFixed(2)}`;
}

function SparklineTooltip({ payload }) {
  if (!payload || payload.length === 0) {
    return null;
  }

  const date = payload?.[0]?.payload?.date;
  const close = Number(payload?.[0]?.value);
  const formattedDate = date ? new Date(date).toLocaleDateString() : "--";
  const formattedClose = Number.isFinite(close) ? `$${close.toFixed(2)}` : "--";

  return (
    <div
      style={{
        backgroundColor: "rgba(0,0,0,0.85)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "6px",
        padding: "6px 10px",
        color: "#fff",
      }}
    >
      <div style={{ color: "#fff" }}>{formattedDate}</div>
      <div style={{ color: "#fff" }}>{formattedClose}</div>
    </div>
  );
}

export default function HistoricalSparklineCard({ symbol }) {
  const {
    candles,
    loading,
    error,
    timeframe,
    setTimeframe,
    currentPrice,
    percentChange,
  } = useHistoricalData(symbol, "1y");

  const isPositive = Number.isFinite(percentChange) ? percentChange >= 0 : null;
  const changeClass =
    isPositive == null ? "sparkline-change" : `sparkline-change ${isPositive ? "positive" : "negative"}`;

  return (
    <div className="card historical-sparkline-card">
      <div className="sparkline-header">
        <h3>Historical Trend</h3>
        <div className="sparkline-symbol">{symbol}</div>
      </div>

      <div className="sparkline-metrics">
        <div className="sparkline-price">{formatPrice(currentPrice)}</div>
        <div className={changeClass}>
          {Number.isFinite(percentChange) ? `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(2)}%` : "--"}
        </div>
      </div>

      <div className="sparkline-timeframes">
        {TIMEFRAMES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn timeframe-btn ${timeframe === option.value ? "active" : ""}`}
            onClick={() => setTimeframe(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="sparkline-chart-wrap">
        {loading ? (
          <div className="sparkline-skeleton" />
        ) : error ? (
          <div className="sparkline-error">{error}</div>
        ) : candles.length === 0 ? (
          <div className="sparkline-empty">No historical data.</div>
        ) : (
          <div className="sparkline-chart-container">
            <ResponsiveContainer width="100%" height={132}>
              <LineChart data={candles} margin={{ top: 10, right: 6, left: 6, bottom: 10 }}>
                <defs>
                  <linearGradient id="sparklineStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(96,165,250,0.95)" />
                    <stop offset="100%" stopColor="rgba(52,211,153,0.95)" />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={({ payload }) => <SparklineTooltip payload={payload} />}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="url(#sparklineStroke)"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
