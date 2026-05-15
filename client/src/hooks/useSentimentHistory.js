import { useCallback, useEffect, useState } from "react";
import axios from "axios";

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase();
}

function normalizeDays(days) {
  const parsed = Number(days ?? 30);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
    return 30;
  }

  return Math.floor(parsed);
}

export default function useSentimentHistory(ticker, days = 30) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSentimentHistory = useCallback(async (normalizedTicker, normalizedDays, signal) => {
    const response = await axios.get(
      `/api/sentiment/history/${encodeURIComponent(normalizedTicker)}?days=${encodeURIComponent(normalizedDays)}`,
      { signal }
    );

    return Array.isArray(response?.data) ? response.data : [];
  }, []);

  const refetch = useCallback(async () => {
    const normalizedTicker = normalizeTicker(ticker);
    const normalizedDays = normalizeDays(days);

    if (!normalizedTicker) {
      setHistory([]);
      setLoading(false);
      setError(null);
      return [];
    }

    try {
      setLoading(true);
      setError(null);

      const freshHistory = await fetchSentimentHistory(normalizedTicker, normalizedDays);
      setHistory(freshHistory);
      return freshHistory;
    } catch (err) {
      setHistory([]);
      setError(err?.response?.data?.error || err?.message || "Failed to load sentiment history");
      return [];
    } finally {
      setLoading(false);
    }
  }, [days, fetchSentimentHistory, ticker]);

  useEffect(() => {
    const normalizedTicker = normalizeTicker(ticker);
    const normalizedDays = normalizeDays(days);

    if (!normalizedTicker) {
      setHistory([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isStale = false;
    const controller = new AbortController();

    async function loadSentimentHistory() {
      try {
        setLoading(true);
        setError(null);
        const nextHistory = await fetchSentimentHistory(normalizedTicker, normalizedDays, controller.signal);

        if (!isStale) {
          setHistory(nextHistory);
        }
      } catch (err) {
        if (controller.signal.aborted || isStale) {
          return;
        }

        if (!isStale) {
          setHistory([]);
          setError(err?.response?.data?.error || err?.message || "Failed to load sentiment history");
        }
      } finally {
        if (!isStale) {
          setLoading(false);
        }
      }
    }

    loadSentimentHistory();

    return () => {
      isStale = true;
      controller.abort();
    };
  }, [days, fetchSentimentHistory, ticker]);

  return { history, loading, error, refetch };
}
