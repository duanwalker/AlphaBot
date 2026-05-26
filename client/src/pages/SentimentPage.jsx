import React, { useCallback, useEffect, useRef, useState } from "react";
import SentimentRow from "../components/sentiment/SentimentRow";
import SentimentComposedChart from "../components/sentiment/SentimentComposedChart";
import { addToWatchlist, getWatchlist } from "../services/watchlistApi";
import { getNextScheduledRunEt } from "../utils/sentimentSchedule";
import useLatestSentiment from "../hooks/useLatestSentiment";
import useToast from "../hooks/useToast";

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function toWatchlistSymbols(entries) {
  return Array.isArray(entries)
    ? entries
        .map(e => normalizeTicker(e?.ticker || e?.symbol || e?.rowKey))
        .filter(Boolean)
    : [];
}

function formatMinutesPastMidnight(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatTimestamp(ts) {
  if (!ts) return "n/a";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "n/a";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function WatchlistFooter({ selectedSymbol }) {
  const { data: snapshot } = useLatestSentiment(selectedSymbol);
  const nextMinutes = getNextScheduledRunEt();
  if (!selectedSymbol) return null;
  return (
    <div style={{ fontSize: 11, color: "#64748b" }}>
      Updated {formatTimestamp(snapshot?.timestamp)} ET · next {formatMinutesPastMidnight(nextMinutes)} ET
    </div>
  );
}

export default function SentimentPage() {
  const { toast } = useToast();
  const [symbols, setSymbols] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [days, setDays] = useState(30);
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [adding, setAdding] = useState(false);
  const addInputRef = useRef(null);

  const loadWatchlist = useCallback(async () => {
    try {
      setWatchlistLoading(true);
      const watchlist = await getWatchlist();
      const nextSymbols = toWatchlistSymbols(watchlist);
      setSymbols(nextSymbols);
      return nextSymbols;
    } catch {
      setSymbols([]);
      return [];
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    let stale = false;
    loadWatchlist().then(nextSymbols => {
      if (!stale && nextSymbols.length) {
        setSelectedSymbol(prev =>
          !prev || !nextSymbols.includes(prev) ? nextSymbols[0] : prev
        );
      }
    });
    return () => { stale = true; };
  }, [loadWatchlist, refreshKey]);

  useEffect(() => {
    function handleWatchlistUpdated() {
      setRefreshKey(k => k + 1);
    }
    window.addEventListener("watchlist:updated", handleWatchlistUpdated);
    return () => window.removeEventListener("watchlist:updated", handleWatchlistUpdated);
  }, []);

  useEffect(() => {
    if (showAdd) addInputRef.current?.focus();
  }, [showAdd]);

  const handleAddSubmit = useCallback(async e => {
    e?.preventDefault();
    const ticker = normalizeTicker(addInput);
    if (!ticker || adding) return;
    try {
      setAdding(true);
      await addToWatchlist(ticker);
      await loadWatchlist();
      setSelectedSymbol(ticker);
      window.dispatchEvent(new CustomEvent("watchlist:updated"));
      setAddInput("");
      setShowAdd(false);
      toast.success(`Added ${ticker} to watch list`);
    } catch (err) {
      toast.error(err?.message || "Failed to add symbol");
    } finally {
      setAdding(false);
    }
  }, [addInput, adding, loadWatchlist, toast]);

  return (
    <div style={{
      display: "flex",
      gap: 20,
      padding: "24px 28px",
      height: "calc(100vh - 66px)",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* Left: watch list */}
      <div style={{
        width: 340,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(15,23,42,0.6)",
        padding: "16px 14px 12px",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Sentiment</span>
          <span
            title="Sentiment updates 3× daily at 9:15 AM, 1:00 PM, and 4:10 PM ET."
            style={{ color: "#94a3b8", cursor: "help", fontSize: 13 }}
          >
            ⓘ
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
          {watchlistLoading ? (
            <div style={{ color: "#64748b", fontSize: 13, padding: "12px 0" }}>Loading…</div>
          ) : symbols.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, padding: "12px 0" }}>
              No symbols yet. Use the button below to add one.
            </div>
          ) : (
            symbols.map(symbol => (
              <SentimentRow
                key={symbol}
                symbol={symbol}
                selected={symbol === selectedSymbol}
                onSelect={setSelectedSymbol}
                selectedColor="#22c55e"
              />
            ))
          )}
        </div>

        <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          <WatchlistFooter selectedSymbol={selectedSymbol} />

          {showAdd ? (
            <form onSubmit={handleAddSubmit} style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                ref={addInputRef}
                value={addInput}
                onChange={e => setAddInput(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={10}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  color: "#e2e8f0",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={!addInput.trim() || adding}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(34,197,94,0.5)",
                  background: "rgba(34,197,94,0.12)",
                  color: "#86efac",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: adding ? "default" : "pointer",
                }}
              >
                {adding ? "…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddInput(""); }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "6px 0",
                borderRadius: 8,
                border: "1px dashed rgba(255,255,255,0.2)",
                background: "transparent",
                color: "#64748b",
                fontSize: 12,
                cursor: "pointer",
                transition: "border-color 160ms ease, color 160ms ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(34,197,94,0.5)";
                e.currentTarget.style.color = "#86efac";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.color = "#64748b";
              }}
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Right: chart panel */}
      <div style={{
        flex: 1,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(15,23,42,0.6)",
        padding: "20px 20px 16px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {selectedSymbol ? (
          <>
            <div style={{ marginBottom: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{selectedSymbol}</span>
              <span style={{ fontSize: 13, color: "#64748b" }}>Price vs Sentiment</span>
            </div>
            <SentimentComposedChart
              symbol={selectedSymbol}
              days={days}
              onDaysChange={setDays}
            />
          </>
        ) : (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#475569",
            fontSize: 14,
          }}>
            Select a ticker from the watch list to view the chart
          </div>
        )}
      </div>
    </div>
  );
}
