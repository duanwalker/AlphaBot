import express from "express";
import { getAlpacaQuote } from "../services/brokerService.js";

const router = express.Router();

router.get("/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const { id: userId, tenantId } = req.user;

  try {
    const quote = await getAlpacaQuote(symbol, userId, tenantId);

    res.json({
      symbol,
      bid: quote?.bid ?? null,
      ask: quote?.ask ?? null,
      timestamp: quote?.timestamp ?? null,
      userId,
      tenantId,
    });
  } catch (err) {
    console.error("Search error:", err.response?.data || err.message);
    res.json({ error: "Symbol not found" });
  }
});

export default router;
