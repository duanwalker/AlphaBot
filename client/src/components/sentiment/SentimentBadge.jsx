import React, { useMemo } from "react";

function toDisplayScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric * 100;
  }

  if (numeric >= -1 && numeric <= 1) {
    return (numeric + 1) * 50;
  }

  return numeric;
}

function getSentimentTone(score) {
  if (!Number.isFinite(score)) {
    return {
      label: "No data",
      background: "rgba(71, 85, 105, 0.35)",
      border: "rgba(148, 163, 184, 0.5)",
      text: "#e2e8f0",
    };
  }

  if (score < 45) {
    return {
      label: "Bearish",
      background: "rgba(239, 68, 68, 0.2)",
      border: "rgba(248, 113, 113, 0.5)",
      text: "#fecaca",
    };
  }

  if (score > 55) {
    return {
      label: "Bullish",
      background: "rgba(34, 197, 94, 0.2)",
      border: "rgba(74, 222, 128, 0.5)",
      text: "#bbf7d0",
    };
  }

  return {
    label: "Neutral",
    background: "rgba(234, 179, 8, 0.2)",
    border: "rgba(250, 204, 21, 0.55)",
    text: "#fde68a",
  };
}

export default function SentimentBadge({ score }) {
  const displayScore = useMemo(() => toDisplayScore(score), [score]);
  const tone = useMemo(() => getSentimentTone(displayScore), [displayScore]);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.text,
        padding: "6px 12px",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {Number.isFinite(displayScore) ? `${displayScore.toFixed(1)} / 100` : "--"}
      </span>
      <span style={{ opacity: 0.9 }}>{tone.label}</span>
    </div>
  );
}
