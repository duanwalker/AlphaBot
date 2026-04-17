import axios from "axios";

const RAPID_API_HOST = "yahoo-finance187.p.rapidapi.com";
const RAPID_API_URL = `https://${RAPID_API_HOST}/api/yahoofinance/v1/quote/historical-data`;

function resolveDateRange(timeframe = "1y") {
  const normalized = String(timeframe || "1y").toLowerCase();
  const dateUntil = new Date();
  const dateFrom = new Date(dateUntil);

  switch (normalized) {
    case "1y":
      dateFrom.setUTCFullYear(dateFrom.getUTCFullYear() - 1);
      break;
    case "6mo":
      dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 6);
      break;
    case "1mo":
      dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 1);
      break;
    case "5d":
      dateFrom.setUTCDate(dateFrom.getUTCDate() - 5);
      break;
    case "1d":
      dateFrom.setUTCDate(dateFrom.getUTCDate() - 1);
      break;
    default: {
      const error = new Error(
        `Unsupported timeframe '${timeframe}'. Supported: 1y, 6mo, 1mo, 5d, 1d`
      );
      error.code = "UNSUPPORTED_TIMEFRAME";
      throw error;
    }
  }

  return {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_until: dateUntil.toISOString().slice(0, 10),
  };
}

export async function fetchYahooHistorical(symbol, timeframe = "1y") {
  const apiKey = process.env.YAHOO_PROXY_API_KEY;
  if (!apiKey) {
    const error = new Error("Missing YAHOO_PROXY_API_KEY");
    error.code = "YAHOO_PROXY_API_KEY_MISSING";
    throw error;
  }

  const { date_from, date_until } = resolveDateRange(timeframe);

  const response = await axios.get(RAPID_API_URL, {
    params: {
      symbol,
      date_from,
      date_until,
    },
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": RAPID_API_HOST,
      "Content-Type": "application/json",
    },
  });

  const timestamps = response?.data?.timestamp;
  const quote = response?.data?.indicators?.quote?.[0];

  if (!timestamps || !quote) {
    return [];
  }

  return { timestamps, quote };
}

export default fetchYahooHistorical;
