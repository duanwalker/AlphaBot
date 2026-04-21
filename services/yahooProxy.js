import axios from "axios";

export async function fetchYahooProxyQuote(symbol, userId) {
  void userId;
  const apiKey = process.env.YAHOO_PROXY_API_KEY;

  if (!apiKey) {
    console.warn("Missing YAHOO_PROXY_API_KEY");
    return null;
  }

  const url = `https://yahoo-finance187.p.rapidapi.com/api/yahoofinance/v1/quote/summary?symbol=${symbol}`;
  const headers = {
    "X-RapidAPI-Key": apiKey,
    "X-RapidAPI-Host": "yahoo-finance187.p.rapidapi.com",
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
  };

  try {
    const response = await axios.get(url, { headers });
    const quoteData = response.data;
   
    if (!quoteData) {
      return null;
    }

    const high = quoteData.fiftyTwoWeekHigh?.raw;
    const low = quoteData.fiftyTwoWeekLow?.raw;
    const price = quoteData.regularMarketPrice?.raw;
    const prevClose = quoteData.regularMarketPreviousClose?.raw;

    return {
      high,
      low,
      price,
      prevClose,
      source: "yahoo_proxy_quote_fields",
    };
  } catch (err) {
    console.error(`Yahoo Proxy API error for ${symbol}:`, err.message);
    return null;
  }
}

export default fetchYahooProxyQuote;
