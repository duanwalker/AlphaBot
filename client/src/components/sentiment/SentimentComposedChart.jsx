import React, { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import useHistoricalData from "../../hooks/useHistoricalData";
import useSentimentHistory from "../../hooks/useSentimentHistory";

const DAY_OPTIONS = [30, 60, 90];

function toUnitScore(entry) {
  const raw = Number(
    entry?.sentimentScore ?? entry?.averageScore ?? entry?.score ?? entry?.value
  );
  if (!Number.isFinite(raw)) return null;

  // Azure stores 0-1 scale → convert to -1 to 1
  if (raw >= 0 && raw <= 1) {
    return (raw * 2) - 1;
  }

  // Already -1 to 1
  if (raw >= -1 && raw < 0) {
    return raw;
  }

  // 0-100 fallback
  if (raw > 1 && raw <= 100) {
    return Math.max(-1, Math.min(1, raw / 50 - 1));
  }

  return Math.max(-1, Math.min(1, raw));
}

function toDateKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey) {
  const [, month, day] = dateKey.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[month - 1]} ${day}`;
}

function computeLeadDays(data) {
  if (data.length < 10) return null;

  const returns = data.map((d, i) => {
    if (i === 0) return null;
    const prev = data[i - 1]?.close;
    const curr = d?.close;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) return null;
    return (curr - prev) / prev;
  });

  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = 0; lag <= 7; lag++) {
    const pairs = [];
    for (let i = 0; i < data.length - lag - 1; i++) {
      const sent = data[i]?.sentiment;
      const ret = returns[i + lag + 1];
      if (Number.isFinite(sent) && Number.isFinite(ret)) {
        pairs.push([sent, ret]);
      }
    }
    if (pairs.length < 5) continue;

    const meanS = pairs.reduce((a, [s]) => a + s, 0) / pairs.length;
    const meanR = pairs.reduce((a, [, r]) => a + r, 0) / pairs.length;
    const num = pairs.reduce((a, [s, r]) => a + (s - meanS) * (r - meanR), 0);
    const denS = Math.sqrt(pairs.reduce((a, [s]) => a + (s - meanS) ** 2, 0));
    const denR = Math.sqrt(pairs.reduce((a, [, r]) => a + (r - meanR) ** 2, 0));
    if (denS < 1e-9 || denR < 1e-9) continue;
    const corr = num / (denS * denR);

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return bestCorr > 0 ? bestLag : null;
}

function findSentimentSpikes(data) {
  const values = data.filter(d => Number.isFinite(d.sentiment)).map(d => d.sentiment);
  if (values.length < 5) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (std < 1e-9) return [];
  return data.filter(d => Number.isFinite(d.sentiment) && Math.abs(d.sentiment - mean) > 1.5 * std);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 12,
      color: "#e2e8f0",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#94a3b8" }}>{label}</div>
      {payload.map(entry => (
        <div key={entry.name} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.name}:{" "}
          {entry.name === "Price"
            ? `$${Number(entry.value).toFixed(2)}`
            : entry.name === "Sentiment"
            ? (entry.value >= 0 ? "+" : "") + Number(entry.value).toFixed(2)
            : Number(entry.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

export default function SentimentComposedChart({ symbol, days, onDaysChange }) {
  const { candles, loading: priceLoading } = useHistoricalData(symbol, "6mo");
  const { history, loading: sentLoading } = useSentimentHistory(symbol, days);

  const mergedData = useMemo(() => {
    if (!candles.length) return [];

    const sentMap = new Map();
    for (const entry of history) {
      const ts = entry?.timestamp || entry?.asOf || entry?.date;
      const key = toDateKey(ts);
      const score = toUnitScore(entry);
      if (key && Number.isFinite(score)) sentMap.set(key, score);
    }

    return candles
      .slice(-days)
      .map(candle => {
        const ts = candle?.date || candle?.t || candle?.timestamp;
        const key = toDateKey(ts);
        const close = Number(candle?.close ?? candle?.c);
        const volume = Number(candle?.volume ?? candle?.v ?? 0);
        return {
          date: key ? formatDateLabel(key) : "?",
          dateKey: key,
          close: Number.isFinite(close) ? close : null,
          volume: Number.isFinite(volume) && volume > 0 ? volume : null,
          sentiment: key ? (sentMap.get(key) ?? null) : null,
        };
      })
      .filter(d => d.close !== null);
  }, [candles, history, days]);

  const leadDays = useMemo(() => computeLeadDays(mergedData), [mergedData]);
  const spikes = useMemo(() => findSentimentSpikes(mergedData), [mergedData]);
  const volumeMax = useMemo(() => {
    const vols = mergedData.map(d => d.volume).filter(Number.isFinite);
    return vols.length ? Math.max(...vols) : 0;
  }, [mergedData]);

  const hasSentiment = mergedData.some(d => d.sentiment !== null);
  const hasVolume = volumeMax > 0;
  const loading = priceLoading || sentLoading;

  if (!symbol) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#475569", fontSize: 14 }}>
        Select a ticker from the watch list
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {DAY_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => onDaysChange(d)}
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              border: days === d
                ? "1px solid rgba(99,102,241,0.65)"
                : "1px solid rgba(255,255,255,0.14)",
              background: days === d ? "rgba(99,102,241,0.18)" : "transparent",
              color: days === d ? "#a5b4fc" : "#94a3b8",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 180ms ease",
            }}
          >
            {d}D
          </button>
        ))}
        {leadDays !== null && hasSentiment && (
          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>
            Leads price by avg{" "}
            <span style={{ color: "#f59e0b", fontWeight: 700 }}>{leadDays}d</span>
            {" "}on {symbol}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{
          height: 280,
          borderRadius: 10,
          background: "rgba(148,163,184,0.1)",
          animation: "pulse 1.4s ease-in-out infinite",
        }} />
      ) : !mergedData.length ? (
        <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 13 }}>
          No price data available for {symbol}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={mergedData} margin={{ top: 8, right: hasSentiment ? 44 : 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              orientation="left"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${Number(v).toFixed(0)}`}
              width={46}
            />
            {hasVolume && (
              <YAxis yAxisId="volume" orientation="right" domain={[0, volumeMax * 5]} hide />
            )}
            {hasSentiment && (
              <YAxis
                yAxisId="sentiment"
                orientation="right"
                domain={[-1, 1]}
                ticks={[-1, -0.5, 0, 0.5, 1]}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v.toFixed(1)}
                width={34}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "#64748b", paddingTop: 6 }} />

            {hasVolume && (
              <Bar
                yAxisId="volume"
                dataKey="volume"
                name="Volume"
                fill="rgba(34,197,94,0.22)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            )}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              name="Price"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {hasSentiment && (
              <Line
                yAxisId="sentiment"
                type="monotone"
                dataKey="sentiment"
                name="Sentiment"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {spikes.map((spike, i) => (
              <ReferenceDot
                key={i}
                yAxisId="sentiment"
                x={spike.date}
                y={spike.sentiment}
                r={5}
                fill="#f59e0b"
                stroke="#0f172a"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
