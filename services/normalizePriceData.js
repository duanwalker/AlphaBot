import { fetchYahooDailyCloses } from "./yahooPriceData.js";
import { fetchYahooProxyQuote } from "./yahooProxy.js";

export async function normalizePriceData(symbol) {
  const proxyQuote = await fetchYahooProxyQuote(symbol);

  if (proxyQuote) {
    return {
      normalized52WeekHigh: proxyQuote.high,
      normalized52WeekLow: proxyQuote.low,
      normalized52WeekSource: "yahoo_proxy_quote_fields",
    };
  }

  const prices = await fetchYahooDailyCloses(symbol);

  const closes = prices
    .map((row) => {
      if (Number.isFinite(row?.adjClose)) {
        return row.adjClose;
      }
      return row?.close;
    })
    .filter(Number.isFinite);

  if (closes.length === 0) {
    throw new Error(`No valid Yahoo closing prices found for ${symbol}`);
  }

  return {
    normalized52WeekHigh: Math.max(...closes),
    normalized52WeekLow: Math.min(...closes),
    normalized52WeekSource: "yahoo_official_daily_closes_fallback",
  };
}

export default normalizePriceData;