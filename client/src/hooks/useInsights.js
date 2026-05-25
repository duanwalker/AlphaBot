import { useEffect, useState } from 'react';

export default function useInsights() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadInsights() {
      try {
        const response = await fetch('/api/assistant/insights');
        const payload = await response.json().catch(() => null);

        let next = [];
        if (Array.isArray(payload)) {
          next = payload;
        } else if (Array.isArray(payload?.insights)) {
          next = payload.insights;
        }

        if (!cancelled) {
          setInsights(next.slice(0, 3));
        }
      } catch {
        if (!cancelled) {
          setInsights([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, []);

  return { insights, loading };
}
