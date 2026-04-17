function toNumber(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeHistoricalData({ timestamps = [], quote = {} }) {
  const { open = [], high = [], low = [], close = [], volume = [] } = quote;

  return timestamps
    .map((ts, i) => {
      const date = new Date(ts * 1000).toISOString();

      const o = toNumber(open[i]);
      const h = toNumber(high[i]);
      const l = toNumber(low[i]);
      const c = toNumber(close[i]);
      const v = toNumber(volume[i]);

      if (o == null || h == null || l == null || c == null) return null;

      return {
        date,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export default normalizeHistoricalData;
