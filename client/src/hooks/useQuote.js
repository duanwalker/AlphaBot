import { useEffect, useRef, useState } from 'react';

const POLL_MS = 60000;

// Mirrors the quote-fetch pattern already used in ResearchTradeWidget:
// primary Alpaca quote, falling back to the Alpha Vantage global quote.
// Alpaca is cheap to poll (60s server cache, generous free-tier limits),
// but Alpha Vantage free keys are capped at 25 requests/day, so the
// fallback is only attempted once per symbol, never on every poll tick.
export default function useQuote(symbol) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const fallbackTried = useRef(false);

  useEffect(() => {
    if (!symbol) {
      setPrice(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    fallbackTried.current = false;

    async function fetchAlpacaPrice() {
      try {
        const r = await fetch(`/api/alpaca/quote/${symbol}`);
        const d = await r.json();
        const p = d?.ap ?? d?.ask ?? d?.bp ?? d?.bid ?? null;
        return p != null && parseFloat(p) > 0 ? parseFloat(p) : null;
      } catch {
        return null;
      }
    }

    async function fetchAlphaVantagePrice() {
      try {
        const r = await fetch(`/api/market/quote/${symbol}`);
        const d = await r.json();
        const p = d?.['05. price'] ? parseFloat(d['05. price']) : null;
        return Number.isFinite(p) ? p : null;
      } catch {
        return null;
      }
    }

    async function tick() {
      setLoading(true);
      const alpacaPrice = await fetchAlpacaPrice();
      if (cancelled) return;

      if (alpacaPrice != null) {
        setPrice(alpacaPrice);
        setLoading(false);
        return;
      }

      if (!fallbackTried.current) {
        fallbackTried.current = true;
        const fallbackPrice = await fetchAlphaVantagePrice();
        if (!cancelled) setPrice(fallbackPrice);
      }
      if (!cancelled) setLoading(false);
    }

    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  return { price, loading };
}
