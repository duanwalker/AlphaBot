import React, { useMemo } from "react";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import useSentimentHistory from "../../hooks/useSentimentHistory";

const RUN_SCHEDULE_MINUTES = [9 * 60 + 15, 13 * 60, 16 * 60 + 10];

function getEtParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function getEtOffsetMinutes(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });

  const tzPart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName");
  const value = tzPart?.value || "GMT-5";
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) {
    return -300;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function etDateToUtcMs(year, month, day, hour, minute) {
  const sample = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getEtOffsetMinutes(sample);
  return Date.UTC(year, month - 1, day, hour, minute) - offset * 60 * 1000;
}

function getMostRecentScheduledRunUtc(now = new Date()) {
  const et = getEtParts(now);
  const currentMinutes = et.hour * 60 + et.minute;

  let runDay = { year: et.year, month: et.month, day: et.day };
  let runMinutes = RUN_SCHEDULE_MINUTES[0];

  for (const schedule of RUN_SCHEDULE_MINUTES) {
    if (schedule <= currentMinutes) {
      runMinutes = schedule;
    }
  }

  if (currentMinutes < RUN_SCHEDULE_MINUTES[0]) {
    const previous = new Date(Date.UTC(et.year, et.month - 1, et.day - 1));
    runDay = {
      year: previous.getUTCFullYear(),
      month: previous.getUTCMonth() + 1,
      day: previous.getUTCDate(),
    };
    runMinutes = RUN_SCHEDULE_MINUTES[RUN_SCHEDULE_MINUTES.length - 1];
  }

  const hours = Math.floor(runMinutes / 60);
  const minutes = runMinutes % 60;
  return etDateToUtcMs(runDay.year, runDay.month, runDay.day, hours, minutes);
}

function isSnapshotStale(snapshot) {
  if (!snapshot?.timestamp) {
    return true;
  }

  const snapshotMs = new Date(snapshot.timestamp).getTime();
  if (Number.isNaN(snapshotMs)) {
    return true;
  }

  return snapshotMs < getMostRecentScheduledRunUtc();
}

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

export default function SentimentRow({ symbol, selected, onSelect }) {
  const { data: snapshot } = useLatestSentiment(symbol);
  const { history } = useSentimentHistory(symbol, 30);

  const score = normalizedScore(snapshot);
  const previousScore = useMemo(() => {
    if (!Array.isArray(history) || history.length < 2) {
      return null;
    }

    const currentTimestamp = snapshot?.timestamp;
    const previous = history.find((entry) => entry?.timestamp && entry.timestamp !== currentTimestamp) || history[1];
    return normalizedScore(previous);
  }, [history, snapshot]);

  const trendArrow = getTrendArrow(score, previousScore);
  const stale = isSnapshotStale(snapshot);
  const updatedLabel = formatUpdated(snapshot?.timestamp);
  const barWidth = `${Math.round((score || 0) * 100)}%`;

  return (
    <button
      type="button"
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
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 60px 20px", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{symbol}</div>

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

        <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
          {Number.isFinite(score) ? score.toFixed(2) : "--"}
        </div>

        <div style={{ fontSize: 16, textAlign: "center" }}>{trendArrow}</div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", display: "flex", gap: 10, alignItems: "center" }}>
        <span>• Updated {updatedLabel}</span>
        {stale && <span style={{ color: "#fbbf24", fontWeight: 600 }}>⚠ Stale</span>}
      </div>
    </button>
  );
}
