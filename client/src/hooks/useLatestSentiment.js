import { useEffect, useState } from "react";
import axios from "axios";

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase();
}

export default function useLatestSentiment(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const normalizedTicker = normalizeTicker(ticker);

    if (!normalizedTicker) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isStale = false;
    const controller = new AbortController();

    async function loadLatestSentiment() {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.get(`/api/sentiment/latest/${encodeURIComponent(normalizedTicker)}`, {
          signal: controller.signal,
        });

        if (!isStale) {
          setData(response?.data ?? null);
        }
      } catch (err) {
        if (controller.signal.aborted || isStale) {
          return;
        }

        if (!isStale) {
          setData(null);
          setError(err?.response?.data?.error || err?.message || "Failed to load latest sentiment");
        }
      } finally {
        if (!isStale) {
          setLoading(false);
        }
      }
    }

    loadLatestSentiment();

    return () => {
      isStale = true;
      controller.abort();
    };
  }, [ticker]);

  return { data, loading, error };
}
