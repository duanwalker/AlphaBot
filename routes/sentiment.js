import express from "express";
import {
  addToWatchList,
  getSnapshotHistory,
  getWatchList,
  removeFromWatchList,
} from "../services/sentimentDb.js";

const router = express.Router();

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

router.get("/watchlist", async (req, res) => {
  try {
    const { id: userId } = req.user;
    const watchlist = await getWatchList(userId);
    res.json({ watchlist });
  } catch (err) {
    console.error("Sentiment watchlist read error:", err.message);
    res.status(500).json({ error: "Failed to load sentiment watchlist" });
  }
});

router.post("/watchlist/:symbol", async (req, res) => {
  try {
    const { id: userId } = req.user;
    const symbol = normalizeSymbol(req.params.symbol);

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const entry = await addToWatchList(userId, symbol);
    return res.status(201).json({ added: entry });
  } catch (err) {
    console.error("Sentiment watchlist add error:", err.message);
    return res.status(500).json({ error: "Failed to add watchlist symbol" });
  }
});

router.delete("/watchlist/:symbol", async (req, res) => {
  try {
    const { id: userId } = req.user;
    const symbol = normalizeSymbol(req.params.symbol);

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const entry = await removeFromWatchList(userId, symbol);
    return res.json({ removed: entry });
  } catch (err) {
    console.error("Sentiment watchlist remove error:", err.message);
    return res.status(500).json({ error: "Failed to remove watchlist symbol" });
  }
});

router.get("/:symbol/history", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const requestedDays = Number(req.query.days || 30);
    const days = Number.isFinite(requestedDays) ? Math.max(1, requestedDays) : 30;

    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const history = await getSnapshotHistory(symbol, days);
    return res.json({ symbol, days, history });
  } catch (err) {
    console.error("Sentiment history error:", err.message);
    return res.status(500).json({ error: "Failed to load sentiment history" });
  }
});

router.get("/:symbol", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    if (!symbol) {
      return res.status(400).json({ error: "Symbol is required" });
    }

    const history = await getSnapshotHistory(symbol, 3650);
    const snapshot = history[0] || null;

    if (!snapshot) {
      return res.status(404).json({ error: `No sentiment snapshot found for ${symbol}` });
    }

    return res.json({ symbol, snapshot });
  } catch (err) {
    console.error("Sentiment current snapshot error:", err.message);
    return res.status(500).json({ error: "Failed to load sentiment snapshot" });
  }
});

router.post("/:symbol/refresh", async (req, res) => {
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) {
    return res.status(400).json({ error: "Symbol is required" });
  }

  return res.status(501).json({
    error: "Sentiment refresh pipeline is not implemented yet (Phase 2).",
    symbol,
  });
});

export default router;
