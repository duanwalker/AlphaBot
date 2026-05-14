import React, { useMemo } from "react";
import useSentimentHistory from "../../hooks/useSentimentHistory";

function toUnitScore(entry) {
  const raw = Number(entry?.averageScore ?? entry?.sentimentScore ?? entry?.score ?? entry?.value);
  if (!Number.isFinite(raw)) {
    return null;
  }

  if (raw >= 0 && raw <= 1) {
    return raw;
  }

  if (raw >= -1 && raw <= 1) {
    return (raw + 1) / 2;
  }

  if (raw >= 0 && raw <= 100) {
    return raw / 100;
  }

  return null;
}

function toTimestamp(entry) {
  const candidate = entry?.timestamp || entry?.asOf || entry?.date;
  const ms = new Date(candidate).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function normalizeHistory(history) {
  return history
    .map((entry) => ({
      ...entry,
      score: toUnitScore(entry),
      t: toTimestamp(entry),
    }))
    .filter((entry) => Number.isFinite(entry.score) && Number.isFinite(entry.t))
    .sort((a, b) => a.t - b.t)
    .slice(-30);
}

function buildSmoothPath(points) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    const only = points[0];
    return `M ${only.x} ${only.y} L ${only.x + 0.1} ${only.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    path += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  return path;
}

function formatDay(ms) {
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ResearchSentimentChart({ symbol }) {
  const { history, loading, error } = useSentimentHistory(symbol, 30);

  const normalized = useMemo(() => normalizeHistory(history), [history]);

  const view = useMemo(() => {
    const width = 720;
    const height = 220;
    const top = 14;
    const right = 14;
    const bottom = 26;
    const left = 14;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const points = normalized.map((item, index) => {
      const x = left + (normalized.length > 1 ? (index / (normalized.length - 1)) * innerWidth : innerWidth / 2);
      const y = top + (1 - item.score) * innerHeight;
      return { x, y, t: item.t };
    });

    const linePath = buildSmoothPath(points);
    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`
        : "";

    return { width, height, top, bottom, points, linePath, areaPath };
  }, [normalized]);

  if (loading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 12 }}>
        <div style={{ marginBottom: 8, color: "#94a3b8", fontSize: 13 }}>Loading sentiment trend...</div>
        <div style={{ height: 220, borderRadius: 10, background: "rgba(148,163,184,0.14)", animation: "pulse 1.4s ease-in-out infinite" }} />
      </div>
    );
  }

  if (error) {
    return <p className="empty">{error}</p>;
  }

  if (!normalized.length) {
    return <p className="empty">No sentiment data yet</p>;
  }

  const firstDate = normalized[0].t;
  const midDate = normalized[Math.floor(normalized.length / 2)].t;
  const lastDate = normalized[normalized.length - 1].t;

  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 12 }}>
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 12 }}>
        <span>Sentiment (0-1 normalized)</span>
        <span>{symbol}</span>
      </div>

      <svg viewBox={`0 0 ${view.width} ${view.height}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="researchSentimentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.45)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
          </linearGradient>
        </defs>

        <line x1="14" y1={view.top} x2={view.width - 14} y2={view.top} stroke="rgba(148,163,184,0.22)" strokeDasharray="4 4" />
        <line
          x1="14"
          y1={(view.top + (view.height - view.bottom)) / 2}
          x2={view.width - 14}
          y2={(view.top + (view.height - view.bottom)) / 2}
          stroke="rgba(148,163,184,0.22)"
          strokeDasharray="4 4"
        />
        <line
          x1="14"
          y1={view.height - view.bottom}
          x2={view.width - 14}
          y2={view.height - view.bottom}
          stroke="rgba(148,163,184,0.22)"
          strokeDasharray="4 4"
        />

        <path d={view.areaPath} fill="url(#researchSentimentFill)" style={{ transition: "opacity 240ms ease" }} />
        <path
          d={view.linePath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 3px rgba(56,189,248,0.45))" }}
        />
      </svg>

      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", color: "#94a3b8", fontSize: 12 }}>
        <span>{formatDay(firstDate)}</span>
        <span style={{ textAlign: "center" }}>{formatDay(midDate)}</span>
        <span style={{ textAlign: "right" }}>{formatDay(lastDate)}</span>
      </div>
    </div>
  );
}
