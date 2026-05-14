import React, { memo, useMemo } from "react";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import { isSnapshotStale } from "../../utils/sentimentSchedule";
import SentimentArrow from "./SentimentArrow";

const BULLISH_THRESHOLD = 0.15;
const BEARISH_THRESHOLD = -0.15;

function readSentimentScore(snapshot) {
  const raw = Number(snapshot?.averageScore ?? snapshot?.score);
  if (!Number.isFinite(raw)) {
    return null;
  }

  if (raw >= -1 && raw <= 1) {
    return raw;
  }

  if (raw >= 0 && raw <= 100) {
    return Math.max(-1, Math.min(1, raw / 50 - 1));
  }

  return Math.max(-1, Math.min(1, raw));
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

function getSentimentLabel(score) {
  if (!Number.isFinite(score)) {
    return "Neutral";
  }

  if (score > BULLISH_THRESHOLD) {
    return "Bullish";
  }

  if (score < BEARISH_THRESHOLD) {
    return "Bearish";
  }

  return "Neutral";
}

function MiniSentimentBar({ score }) {
  const unitScore = Number.isFinite(score) ? Math.max(0, Math.min(1, (score + 1) / 2)) : 0.5;
  const barWidth = `${Math.round(unitScore * 100)}%`;

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

  const score = useMemo(() => readSentimentScore(snapshot), [snapshot]);
  const label = useMemo(() => getSentimentLabel(score), [score]);
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
        <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 68px 74px 24px", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{symbol}</div>

          <MiniSentimentBar score={score} />

          <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
            {Number.isFinite(score) ? score.toFixed(2) : "--"}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>{label}</div>

          <div style={{ fontSize: 16, textAlign: "center" }}>
            <SentimentArrow score={score} />
          </div>
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
