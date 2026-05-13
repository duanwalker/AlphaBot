import React, { memo, useMemo } from "react";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import { isSnapshotStale } from "../../utils/sentimentSchedule";

function normalizedScore(snapshot) {
  const averageScore = Number(snapshot?.averageScore);
  if (!Number.isFinite(averageScore)) {
    return null;
  }

  return Math.min(1, Math.max(0, (averageScore + 1) / 2));
}

function formatUpdated(timestamp) {
  if (!timestamp) {
    return "n/a";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "n/a";
  }

  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getTrendArrow(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return "→";
  }

  if (current > previous + 0.01) {
    return "↑";
  }

  if (current < previous - 0.01) {
    return "↓";
  }

  return "→";
}

function MiniSentimentBar({ score }) {
  const barWidth = `${Math.round((score || 0) * 100)}%`;

  return (
    <div
      style={{
        height: 8,
        borderRadius: 999,
        background: "rgba(148,163,184,0.28)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: barWidth,
          height: "100%",
          background: "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)",
          transition: "width 450ms ease",
        }}
      />
    </div>
  );
}

function SentimentRow({ symbol, selected, onSelect }) {
  const { data: snapshot } = useLatestSentiment(symbol);

  const score = normalizedScore(snapshot);
  const previousScore = useMemo(() => {
    const previousAverageScore = Number(snapshot?.previousAverageScore);
    if (!Number.isFinite(previousAverageScore)) {
      return null;
    }

    return Math.min(1, Math.max(0, (previousAverageScore + 1) / 2));
  }, [snapshot]);

  const trendArrow = getTrendArrow(score, previousScore);
  const stale = useMemo(() => isSnapshotStale(snapshot), [snapshot]);
  const updatedLabel = formatUpdated(snapshot?.timestamp);

  return (
    <>
      <style>
        {`.sentiment-row:hover:not(.selected) { background: rgba(99,102,241,0.18) !important; }`}
      </style>
      <button
        type="button"
        className={`sentiment-row ${selected ? "selected" : ""}`}
        onClick={() => onSelect(symbol)}
        style={{
          width: "100%",
          border: selected ? "1px solid rgba(99,102,241,0.65)" : "1px solid rgba(255,255,255,0.08)",
          background: selected ? "rgba(99,102,241,0.12)" : "rgba(2,6,23,0.4)",
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 8,
          color: "#e2e8f0",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 220ms ease, border-color 220ms ease",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 60px 20px", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{symbol}</div>

          <MiniSentimentBar score={score} />

          <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
            {Number.isFinite(score) ? score.toFixed(2) : "--"}
          </div>

          <div style={{ fontSize: 16, textAlign: "center" }}>{trendArrow}</div>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", display: "flex", gap: 10, alignItems: "center" }}>
          <span>• Updated {updatedLabel}</span>
          {stale && (
            <span title="Sentiment is older than the most recent scheduled run" style={{ color: "#fbbf24", fontWeight: 600 }}>
              ⚠ Stale
            </span>
          )}
        </div>
      </button>
    </>
  );
}

export default memo(SentimentRow);
