import React, { memo, useEffect, useMemo, useState } from "react";
import useLatestSentiment from "../../hooks/useLatestSentiment";
import { isSnapshotStale } from "../../utils/sentimentSchedule";
import SentimentArrow from "./SentimentArrow";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../../services/watchlistApi";
import useToast from "../../hooks/useToast";

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

function SentimentRow({ symbol, selected, onSelect, selectedColor }) {
  const { data: snapshot } = useLatestSentiment(symbol);
  const [removing, setRemoving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fade, setFade] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(true);
  const { toast, toastWithAction } = useToast();

  const score = useMemo(() => readSentimentScore(snapshot), [snapshot]);
  const label = useMemo(() => getSentimentLabel(score), [score]);
  const stale = useMemo(() => isSnapshotStale(snapshot), [snapshot]);
  const updatedLabel = formatUpdated(snapshot?.timestamp);

  useEffect(() => {
    let staleRequest = false;

    async function refreshLocalWatchlistState() {
      try {
        const watchlist = await getWatchlist();
        if (staleRequest) {
          return;
        }

        const exists = watchlist.some((entry) => {
          const ticker = String(entry?.ticker || entry?.symbol || entry?.rowKey || "").trim().toUpperCase();
          return ticker === symbol;
        });

        setIsInWatchlist(exists);
      } catch {
        // Keep current UI state if watchlist refresh fails.
      }
    }

    refreshLocalWatchlistState();

    return () => {
      staleRequest = true;
    };
  }, [symbol]);

  async function dispatchWatchlistUpdated() {
    const watchlist = await getWatchlist();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("watchlist:updated", { detail: { watchlist } }));
    }

    const exists = watchlist.some((entry) => {
      const ticker = String(entry?.ticker || entry?.symbol || entry?.rowKey || "").trim().toUpperCase();
      return ticker === symbol;
    });

    setIsInWatchlist(exists);
    return watchlist;
  }

  async function undoRemove(targetSymbol) {
    try {
      await addToWatchlist(targetSymbol);
      await dispatchWatchlistUpdated();
      setRemoved(false);
      setFade(false);
      toast.success(`Added ${targetSymbol} to watchlist`);
    } catch {
      toast.error("Failed to update watchlist");
    }
  }

  async function handleRemove(event) {
    event.preventDefault();
    event.stopPropagation();

    if (removing) {
      return;
    }

    try {
      setRemoving(true);
      await removeFromWatchlist(symbol);

      if (selected) {
        onSelect("");
      }

      await dispatchWatchlistUpdated();
      setFade(true);
      window.setTimeout(() => {
        setRemoved(true);
      }, 250);
      toastWithAction(`Removed ${symbol} from watchlist`, "Undo", () => undoRemove(symbol));
    } catch {
      toast.error("Failed to update watchlist");
    } finally {
      setRemoving(false);
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    event.stopPropagation();

    if (adding) {
      return;
    }

    try {
      setAdding(true);
      await addToWatchlist(symbol);
      await dispatchWatchlistUpdated();
      setRemoved(false);
      setFade(false);
      toast.success(`Added ${symbol} to watchlist`);
    } catch {
      toast.error("Failed to update watchlist");
    } finally {
      setAdding(false);
    }
  }

  if (removed) {
    return null;
  }

  return (
    <>
      <style>
        {`.sentiment-row:hover:not(.selected) { background: rgba(99,102,241,0.18) !important; }`}
      </style>
      <div
        className={`sentiment-row ${selected ? "selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(symbol)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(symbol); } }}
        style={{
          width: "100%",
          ...(selected
            ? selectedColor
              ? {
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderLeft: `3px solid ${selectedColor}`,
                  background: "rgba(34,197,94,0.07)",
                }
              : {
                  border: "1px solid rgba(99,102,241,0.65)",
                  background: "rgba(99,102,241,0.12)",
                }
            : {
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(2,6,23,0.4)",
              }),
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 8,
          color: "#e2e8f0",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 220ms ease, border-color 220ms ease",
          opacity: fade ? 0 : 1,
          willChange: "opacity",
          transitionProperty: "background, border-color, opacity",
          transitionDuration: "220ms, 220ms, 250ms",
          transitionTimingFunction: "ease, ease, ease",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 68px 74px 24px auto", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{symbol}</div>

          <MiniSentimentBar score={score} />

          <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
            {Number.isFinite(score) ? score.toFixed(2) : "--"}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>{label}</div>

          <div style={{ fontSize: 16, textAlign: "center" }}>
            <SentimentArrow score={score} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            {!isInWatchlist && (
              <button
                type="button"
                aria-label={`Add ${symbol} to watchlist`}
                title={`Add ${symbol} to watchlist`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={handleAdd}
                disabled={adding}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1px solid rgba(74,222,128,0.5)",
                  background: adding ? "rgba(74,222,128,0.2)" : "rgba(74,222,128,0.12)",
                  color: "#bbf7d0",
                  fontSize: 14,
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: adding ? "default" : "pointer",
                  transition: "background 160ms ease, border-color 160ms ease",
                }}
              >
                ＋
              </button>
            )}

            {isInWatchlist && (
              <button
                type="button"
                aria-label={`Remove ${symbol} from watchlist`}
                title={`Remove ${symbol} from watchlist`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={handleRemove}
                disabled={removing}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1px solid rgba(248,113,113,0.5)",
                  background: removing ? "rgba(248,113,113,0.2)" : "rgba(248,113,113,0.1)",
                  color: "#fecaca",
                  fontSize: 13,
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: removing ? "default" : "pointer",
                  transition: "background 160ms ease, border-color 160ms ease",
                }}
                onMouseEnter={(event) => {
                  if (!removing) {
                    event.currentTarget.style.background = "rgba(248,113,113,0.24)";
                  }
                }}
                onMouseLeave={(event) => {
                  if (!removing) {
                    event.currentTarget.style.background = "rgba(248,113,113,0.1)";
                  }
                }}
              >
                ✕
              </button>
            )}
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
      </div>
    </>
  );
}

export default memo(SentimentRow);
