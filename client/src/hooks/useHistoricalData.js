import { useEffect, useMemo, useState } from "react";

const DEFAULT_TIMEFRAME = "1y";

export default function useHistoricalData(symbol, initialTimeframe = DEFAULT_TIMEFRAME) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol) {
      setCandles([]);
      setError("");
      return;
    }

    let isCancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `/api/history/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`
        );

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load historical data");
        }

        if (!isCancelled) {
          setCandles(Array.isArray(data?.candles) ? data.candles : []);
        }
      } catch (err) {
        if (!isCancelled) {
          setCandles([]);
          setError(err.message || "Failed to load historical data");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, [symbol, timeframe]);

  const currentPrice = useMemo(() => {
    if (candles.length === 0) return null;
    return Number(candles[candles.length - 1]?.close);
  }, [candles]);

  const percentChange = useMemo(() => {
    if (candles.length < 2) return null;

    const firstClose = Number(candles[0]?.close);
    const lastClose = Number(candles[candles.length - 1]?.close);

    if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose) || firstClose === 0) {
      return null;
    }

    return ((lastClose - firstClose) / firstClose) * 100;
  }, [candles]);

  return {
    candles,
    loading,
    error,
    timeframe,
    setTimeframe,
    currentPrice,
    percentChange,
  };
}
