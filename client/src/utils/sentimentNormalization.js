export const BULLISH_THRESHOLD = 0.15;
export const BEARISH_THRESHOLD = -0.15;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function readSentimentScore(snapshot) {
  const raw = Number(snapshot?.averageScore ?? snapshot?.score);
  if (!Number.isFinite(raw)) {
    return null;
  }

  if (raw >= -1 && raw <= 1) {
    return raw;
  }

  if (raw >= 0 && raw <= 100) {
    return clamp(raw / 50 - 1, -1, 1);
  }

  return clamp(raw, -1, 1);
}

export function getSentimentLabel(score) {
  if (!Number.isFinite(score)) {
    return "No data yet";
  }

  if (score > BULLISH_THRESHOLD) {
    return "Bullish";
  }

  if (score < BEARISH_THRESHOLD) {
    return "Bearish";
  }

  return "Neutral";
}

export function normalizeSentimentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  const score = readSentimentScore(snapshot);
  return {
    ...snapshot,
    score,
    label: getSentimentLabel(score),
  };
}

export function toGaugeAngle(score, minAngle = -90, maxAngle = 90) {
  if (!Number.isFinite(score)) {
    return minAngle;
  }

  const clampedScore = clamp(score, -1, 1);
  const ratio = (clampedScore + 1) / 2;
  return minAngle + ratio * (maxAngle - minAngle);
}
