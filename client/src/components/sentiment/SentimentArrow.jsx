import React, { memo, useMemo } from "react";

const BULLISH_THRESHOLD = 0.15;
const BEARISH_THRESHOLD = -0.15;

function resolveArrow(score) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return { glyph: "→", color: "#facc15", label: "Neutral" };
  }

  if (numericScore > BULLISH_THRESHOLD) {
    return { glyph: "↑", color: "#4ade80", label: "Bullish" };
  }

  if (numericScore < BEARISH_THRESHOLD) {
    return { glyph: "↓", color: "#f87171", label: "Bearish" };
  }

  return { glyph: "→", color: "#facc15", label: "Neutral" };
}

function SentimentArrow({ score }) {
  const arrow = useMemo(() => resolveArrow(score), [score]);

  return (
    <span title={arrow.label} style={{ color: arrow.color, fontWeight: 800, lineHeight: 1 }}>
      {arrow.glyph}
    </span>
  );
}

export default memo(SentimentArrow);
