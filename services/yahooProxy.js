import axios from "axios";

export async function fetchYahooProxyQuote(symbol) {
  const apiKey = process.env.YAHOO_PROXY_API_KEY;

  if (!apiKey) {
    console.warn("YAHOO_PROXY_API_KEY not configured, will fall back to chart data");
    return null;
  }

  const url = `https://yfapi.net/v6/finance/quote?symbols=${symbol}`;
  const headers = {
    "x-api-key": apiKey,
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
  };

  try {
    const response = await axios.get(url, { headers });
    const quoteData = response.data?.quoteResponse?.result?.[0];

    if (!quoteData) {
      return null;
    }

    return {
      fiftyTwoWeekHigh: quoteData?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quoteData?.fiftyTwoWeekLow,
      regularMarketPrice: quoteData?.regularMarketPrice,
      regularMarketPreviousClose: quoteData?.regularMarketPreviousClose,
    };
  } catch (err) {
    console.error(`Yahoo Proxy API error for ${symbol}:`, err.message);
    return null;
  }
}

export default fetchYahooProxyQuote;
