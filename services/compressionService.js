/**
 * services/compressionService.js
 * Research Mode (A2) compression helpers for /api/assistant payload optimization.
 *
 * Reduces Claude input token count by 70-85% while preserving analytical depth.
 * Each helper extracts only the essential fields needed for trading analysis.
 */

/**
 * Compress fundamentals to key research metrics.
 * @param {object} raw - Raw fundamentals object from getFundamentals()
 * @returns {object} Compressed fundamentals with ~13 key fields
 */
export function compressFundamentals(raw) {
  if (!raw) return null;

  return {
    symbol: raw.symbol || null,
    marketCap: raw.marketCap || null,
    peRatio: raw.peRatio || null,
    pegRatio: raw.pegRatio || null,
    eps: raw.eps || null,
    revenueTTM: raw.revenueTTM || null,
    profitMargin: raw.profitMargin || null,
    dividendYield: raw.dividendYield || null,
    beta: raw.beta || null,
    fiftyTwoWeekHigh: raw.normalized52WeekHigh || raw.week52High || null,
    fiftyTwoWeekLow: raw.normalized52WeekLow || raw.week52Low || null,
    sector: raw.sector || null,
    industry: raw.industry || null,
  };
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractTimestamp(candle, index) {
  const candidates = [
    candle?.date,
    candle?.datetime,
    candle?.timestamp,
    candle?.time,
    candle?.t,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    if (typeof candidate === "number") {
      return candidate > 1e12 ? candidate : candidate * 1000;
    }

    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return index;
}

function extractCandles(rawHistory) {
  if (!rawHistory) return [];

  // Case 1: Already an array
  if (Array.isArray(rawHistory)) return rawHistory;

  // Case 2: RapidAPI Yahoo format: { values: [...] }
  if (Array.isArray(rawHistory.values)) return rawHistory.values;

  // Case 3: Yahoo native format
  const quote = rawHistory?.chart?.result?.[0]?.indicators?.quote?.[0];
  const timestamps = rawHistory?.chart?.result?.[0]?.timestamp;

  if (quote && Array.isArray(timestamps) && Array.isArray(quote.close)) {
    return timestamps.map((t, i) => ({
      datetime: t,
      close: quote.close?.[i],
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      volume: quote.volume?.[i],
    }));
  }

  // Provider-friendly fallbacks for current/future integrations.
  if (Array.isArray(rawHistory.bars)) return rawHistory.bars;
  if (Array.isArray(rawHistory.results)) return rawHistory.results;
  if (Array.isArray(rawHistory.candles)) return rawHistory.candles;

  return [];
}

/**
 * Compress historical data to aggregate metrics + sparkline.
 * Computes 1-year performance stats and generates 20-point normalized sparkline.
 * @param {array|object|null} rawHistory - Provider-specific history payload
 * @returns {object} Compressed history with trend summary and sparkline
 */
export function compressHistory(rawHistory) {
  const candles = extractCandles(rawHistory);

  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      oneYearChangePercent: 0,
      oneYearVolatility: 0,
      oneYearHigh: null,
      oneYearLow: null,
      trendSummary: "unknown",
      sparkline: [],
    };
  }

  const sorted = [...candles]
    .map((candle, index) => ({
      ts: extractTimestamp(candle, index),
      close: toFiniteNumber(candle?.close),
    }))
    .filter((row) => row.close != null)
    .sort((a, b) => a.ts - b.ts);

  const closes = sorted.map((item) => item.close);

  if (closes.length === 0) {
    return {
      oneYearChangePercent: 0,
      oneYearVolatility: 0,
      oneYearHigh: null,
      oneYearLow: null,
      trendSummary: "unknown",
      sparkline: [],
    };
  }

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];

  const oneYearChangePercent =
    firstClose && firstClose !== 0
      ? ((lastClose - firstClose) / firstClose) * 100
      : 0;

  // Volatility (standard deviation of daily returns) with divide-by-zero protection.
  const dailyReturns = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];

    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;

    const ret = ((curr - prev) / prev) * 100;
    if (Number.isFinite(ret)) {
      dailyReturns.push(ret);
    }
  }

  let oneYearVolatility = 0;
  if (dailyReturns.length > 0) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((a, ret) => a + Math.pow(ret - mean, 2), 0) /
      dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    oneYearVolatility = Number.isFinite(stdDev) ? stdDev : 0;
  }

  const oneYearHigh = closes.length > 0 ? Math.max(...closes) : null;
  const oneYearLow = closes.length > 0 ? Math.min(...closes) : null;

  // Determine trend via 30 vs 90 period means. Fall back to change-based inference.
  const last30 = closes.slice(-30);
  const last90 = closes.slice(-90);

  const avg30 =
    last30.length > 0
      ? last30.reduce((a, b) => a + b, 0) / last30.length
      : null;

  const avg90 =
    last90.length > 0
      ? last90.reduce((a, b) => a + b, 0) / last90.length
      : null;

  let trendSummary = "unknown";
  if (
    Number.isFinite(avg30) &&
    Number.isFinite(avg90) &&
    avg90 !== 0 &&
    closes.length >= 2
  ) {
    trendSummary = "sideways";
    if (avg30 > avg90 * 1.02) {
      trendSummary = "uptrend";
    } else if (avg30 < avg90 * 0.98) {
      trendSummary = "downtrend";
    }
  } else if (Number.isFinite(oneYearChangePercent)) {
    if (oneYearChangePercent > 2) {
      trendSummary = "uptrend";
    } else if (oneYearChangePercent < -2) {
      trendSummary = "downtrend";
    }
  }

  // Generate <=20 point normalized sparkline; handle missing/flat data.
  const sparklinePoints = 20;
  const sampledCloses = [];

  if (closes.length <= sparklinePoints) {
    sampledCloses.push(...closes);
  } else {
    for (let i = 0; i < sparklinePoints; i++) {
      const index = Math.round((i * (closes.length - 1)) / (sparklinePoints - 1));
      sampledCloses.push(closes[index]);
    }
  }

  const validSamples = sampledCloses.filter((value) => Number.isFinite(value));
  let sparkline = [];

  if (validSamples.length > 0) {
    const minClose = Math.min(...validSamples);
    const maxClose = Math.max(...validSamples);

    if (minClose === maxClose) {
      sparkline = validSamples.map(() => 50);
    } else {
      const range = maxClose - minClose;
      sparkline = validSamples.map((close) => {
        const normalized = ((close - minClose) / range) * 100;
        return Number.isFinite(normalized) ? Math.round(normalized) : 0;
      });
    }
  }

  return {
    oneYearChangePercent: Number(oneYearChangePercent.toFixed(2)),
    oneYearVolatility: Number(oneYearVolatility.toFixed(2)),
    oneYearHigh: Number.isFinite(oneYearHigh) ? Number(oneYearHigh.toFixed(2)) : null,
    oneYearLow: Number.isFinite(oneYearLow) ? Number(oneYearLow.toFixed(2)) : null,
    trendSummary,
    sparkline,
  };
}

/**
 * Compress positions to essential trading fields.
 * @param {array} rawPositions - Array of position objects from getAlpacaPositions()
 * @returns {array} Compressed positions with ~6 key fields
 */
export function compressPositions(rawPositions) {
  if (!Array.isArray(rawPositions)) {
    return [];
  }

  return rawPositions.map((pos) => ({
    symbol: pos.symbol || null,
    qty: pos.qty || 0,
    avgEntryPrice: pos.avgEntryPrice || null,
    currentPrice: pos.currentPrice || null,
    unrealizedPL: pos.unrealizedPL || null,
    unrealizedPLPercent: pos.unrealizedPLPercent || null,
  }));
}

/**
 * Compress orders to essential order fields.
 * @param {array} rawOrders - Array of order objects from getAlpacaOrders()
 * @returns {array} Compressed orders with ~5 key fields
 */
export function compressOrders(rawOrders) {
  if (!Array.isArray(rawOrders)) {
    return [];
  }

  return rawOrders.map((order) => ({
    symbol: order.symbol || null,
    side: order.side || null,
    qty: order.qty || 0,
    status: order.status || null,
    filledAvgPrice: order.filled_avg_price || order.filledAvgPrice || null,
  }));
}

/**
 * Compress market snapshot to essential price fields.
 * @param {array} rawSnapshot - Array of snapshot objects with {symbol, bid, ask, last, timestamp}
 * @returns {array} Compressed snapshot with 5 key fields
 */
export function compressSnapshot(rawSnapshot) {
  if (!Array.isArray(rawSnapshot)) {
    return [];
  }

  return rawSnapshot.map((item) => ({
    symbol: item.symbol || null,
    bid: item.bid || item.bp || null,
    ask: item.ask || item.ap || null,
    last: item.last || null,
    timestamp: item.timestamp || null,
  }));
}

/**
 * Assess how reliable social sentiment is for a given symbol based on market cap and post volume.
 * Large caps: sentiment lags price. Small caps: sentiment can lead price.
 * @param {number|string|null} marketCap - Market cap in dollars (e.g. 1.2e12 or "1200000000000")
 * @param {number|string|null} postVolume - Number of posts analyzed for the sentiment reading
 * @returns {{ reliability: string, reason: string, weight: string }}
 */
export function getSentimentReliability(marketCap, postVolume) {
  const cap = parseFloat(marketCap || 0);
  const posts = parseInt(postVolume || 0);

  let reliability, reason, weight;

  if (cap > 50e9) {
    reliability = 'low';
    reason = 'Large cap (>$50B) — social sentiment typically ' +
             'REFLECTS price movement, not predicts it. ' +
             'Retail traders discuss these stocks because ' +
             'they are already moving, not before.';
    weight = 'Use as secondary confirmation only. ' +
             'Weight technicals and fundamentals higher.';
  } else if (cap > 5e9) {
    reliability = 'moderate';
    reason = 'Mid cap ($5B-$50B) — sentiment has moderate ' +
             'predictive value. Mixed institutional and ' +
             'retail ownership.';
    weight = 'Use alongside technicals and fundamentals. ' +
             'Require high signalStrength for conviction.';
  } else if (cap > 0) {
    reliability = 'high';
    reason = 'Small cap (<$5B) — sentiment has higher ' +
             'predictive value. Retail-driven, social ' +
             'discussion often precedes price moves.';
    weight = 'Sentiment signal is meaningful here. ' +
             'Combined with high signalStrength = strong signal.';
  } else {
    reliability = 'unknown';
    reason = 'Market cap unavailable — cannot assess ' +
             'sentiment reliability.';
    weight = 'Treat sentiment signal with caution.';
  }

  if (posts > 0 && posts < 20) {
    reliability = 'low';
    reason += ` Only ${posts} posts analyzed — insufficient ` +
              'data for reliable signal.';
  }

  return { reliability, reason, weight };
}

/**
 * Enrich a sentiment object with market-cap-derived reliability metadata.
 * @param {object|null} sentiment - Raw sentiment built in the assistant handler
 * @param {object|null} fundamentals - Compressed fundamentals (needs marketCap field)
 * @returns {object|null} Sentiment with reliability, reliabilityReason, reliabilityWeight added
 */
export function compressSentimentContext(sentiment, fundamentals) {
  if (!sentiment) return null;

  const marketCap = fundamentals?.marketCap ?? null;
  const postVolume = sentiment?.latest?.postVolume ?? sentiment?.postVolume ?? 0;
  const { reliability, reason, weight } = getSentimentReliability(marketCap, postVolume);

  return {
    ...sentiment,
    reliability,
    reliabilityReason: reason,
    reliabilityWeight: weight,
  };
}

/**
 * Compress a raw sentiment snapshot into a lean payload for Claude injection.
 * Derives reliability tier from market cap: low (>$50B), moderate ($5B-$50B), high (<$5B).
 * @param {object|null} snapshot - Raw sentiment snapshot
 * @param {number|string|null} marketCap - Market cap in dollars
 * @returns {object|null} Compressed sentiment with reliability metadata
 */
export function compressSentimentForClaude(snapshot, marketCap = null) {
  if (!snapshot) return null;

  const score = snapshot.sentimentScore ?? snapshot.score ?? null;
  const postVolume = snapshot.postCount ?? snapshot.totalPosts ?? null;

  const cap = parseFloat(marketCap || 0);
  let reliability = 'unknown';
  if (cap > 50e9)      reliability = 'low';
  else if (cap > 5e9)  reliability = 'moderate';
  else if (cap > 0)    reliability = 'high';

  return {
    score,
    signalStrength: snapshot.signalStrength || null,
    trend: snapshot.trend || null,
    agentConfidence: snapshot.agentConfidence || null,
    bullBearRatio: snapshot.bullBearRatio || null,
    postVolume,
    reliability,
    timestamp: snapshot.timestamp || null,
    positiveDrivers: snapshot.positiveDrivers || [],
    negativeDrivers: snapshot.negativeDrivers || [],
  };
}

export default {
  compressFundamentals,
  compressHistory,
  compressPositions,
  compressOrders,
  compressSnapshot,
  getSentimentReliability,
  compressSentimentContext,
  compressSentimentForClaude,
};
