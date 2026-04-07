import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const response = await axios.get(
      `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      }
    );

    const quote = response.data?.quote;

    res.json({
      symbol,
      bid: quote?.bp ?? null,
      ask: quote?.ap ?? null,
      timestamp: quote?.t ?? null,
    });
  } catch (err) {
    console.error("Search error:", err.response?.data || err.message);
    res.json({ error: "Symbol not found" });
  }
});

export default router;
