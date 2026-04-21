import axios from "axios";

function buildYahooRows(data) {
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quotes = result?.indicators?.quote?.[0] || {};
  const closes = quotes?.close || [];
  const adjCloses = result?.indicators?.adjclose?.[0]?.adjclose || [];

  return timestamps
    .map((ts, idx) => {
      const close = Number.parseFloat(closes[idx]);
      const adjClose = Number.parseFloat(adjCloses[idx]);
      if (!Number.isFinite(close) && !Number.isFinite(adjClose)) {
        return null;
      }
      return {
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close: Number.isFinite(close) ? close : null,
        adjClose: Number.isFinite(adjClose) ? adjClose : null,
      };
    })
    .filter(Boolean);
}

export async function fetchYahooDailyCloses(symbol, userId) {
  void userId;
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });
      const rows = buildYahooRows(response.data);
      if (rows.length > 0) {
        return rows;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`No Yahoo daily close data found for ${symbol}`);
}

export async function fetchYahooQuote52WeekRange(symbol, userId) {
  void userId;
  const urls = [
    `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`,
    `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      const quoteData = response.data?.quoteResponse?.result?.[0];
      const fiftyTwoWeekHigh = quoteData?.fiftyTwoWeekHigh;
      const fiftyTwoWeekLow = quoteData?.fiftyTwoWeekLow;

      if (Number.isFinite(fiftyTwoWeekHigh) && Number.isFinite(fiftyTwoWeekLow)) {
        return {
          fiftyTwoWeekHigh: Number.parseFloat(fiftyTwoWeekHigh),
          fiftyTwoWeekLow: Number.parseFloat(fiftyTwoWeekLow),
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
  };
}

export default fetchYahooDailyCloses;
