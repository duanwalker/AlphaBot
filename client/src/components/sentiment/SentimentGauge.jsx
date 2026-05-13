import React, { useMemo } from "react";

const GAUGE_WIDTH = 320;
const GAUGE_HEIGHT = 190;
const CENTER_X = GAUGE_WIDTH / 2;
const CENTER_Y = 160;
const RADIUS = 110;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toGaugeValue(averageScore) {
  const score = Number(averageScore);
  if (!Number.isFinite(score)) {
    return null;
  }

  return clamp((score + 1) * 50, 0, 100);
}

function describeSentiment(value) {
  if (!Number.isFinite(value)) {
    return "No data yet";
  }

  if (value < 45) {
    return "Bearish";
  }

  if (value > 55) {
    return "Bullish";
  }

  return "Neutral";
}

function polarToCartesian(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SentimentGauge({ ticker, snapshot, loading, error, isStale }) {
  const gaugeValue = useMemo(() => toGaugeValue(snapshot?.averageScore), [snapshot]);
  const gaugeLabel = useMemo(() => describeSentiment(gaugeValue), [gaugeValue]);

  const needleAngle = useMemo(() => {
    if (!Number.isFinite(gaugeValue)) {
      return -90;
    }

    return -90 + (gaugeValue / 100) * 180;
  }, [gaugeValue]);

  const updatedLabel = formatTimestamp(snapshot?.timestamp);
  const noData = !snapshot;

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.1)",
        background: noData ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.45)",
        padding: "14px 14px 10px",
      }}
    >
      <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
        <svg width="100%" viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}>
          <path
            d={arcPath(CENTER_X, CENTER_Y, RADIUS, -90, -18)}
            stroke="rgba(217, 83, 79, 0.88)"
            strokeWidth="18"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={arcPath(CENTER_X, CENTER_Y, RADIUS, -18, 18)}
            stroke="rgba(240, 173, 78, 0.88)"
            strokeWidth="18"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={arcPath(CENTER_X, CENTER_Y, RADIUS, 18, 90)}
            stroke="rgba(92, 184, 92, 0.9)"
            strokeWidth="18"
            fill="none"
            strokeLinecap="round"
          />

          {!noData && (
            <g
              style={{
                transform: `rotate(${needleAngle}deg)`,
                transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
                transition: "transform 550ms cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <line
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={CENTER_X}
                y2={CENTER_Y - (RADIUS - 14)}
                stroke="#f8fafc"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          )}

          <circle cx={CENTER_X} cy={CENTER_Y} r="6" fill="#e2e8f0" />
        </svg>

        {noData && (
          <div
            style={{
              position: "absolute",
              top: 78,
              textAlign: "center",
              color: "#cbd5e1",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>No sentiment data yet</div>
            <div style={{ fontSize: 12, opacity: 0.82 }}>Next update at 9:15 AM ET</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: -10, textAlign: "center" }}>
        {error ? (
          <>
            <div style={{ fontSize: 14, color: "#fda4af", fontWeight: 600 }}>Error loading sentiment</div>
            <div style={{ fontSize: 12, color: "#fecdd3" }}>{error}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: "#cbd5e1" }}>{ticker || "No symbol selected"}</div>
            <div style={{ fontSize: 27, fontWeight: 700 }}>
              {loading ? "..." : Number.isFinite(gaugeValue) ? `${gaugeValue.toFixed(1)} / 100` : "--"}
            </div>
            <div style={{ fontSize: 14, color: "#94a3b8" }}>{gaugeLabel}</div>
            {isStale && !noData && (
              <div style={{ marginTop: 4, fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>⚠ Stale</div>
            )}
            {updatedLabel && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>Updated {updatedLabel}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
