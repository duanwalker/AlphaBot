import express from "express";
import {
  addToWatchlist,
  addToWatchList,
  getLatestSnapshot,
  getSnapshotHistory,
  getWatchList,
  removeFromWatchList,
} from "../services/sentimentDb.js";

const router = express.Router();

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9]+$/.test(symbol);
}

function getSymbolValidationReason(rawSymbol) {
  const trimmed = String(rawSymbol || "").trim();

  if (!trimmed) {
    return "Symbol is required";
  }

  if (!/^[a-z0-9]+$/i.test(trimmed)) {
    return "Symbol must be alphanumeric";
  }

  return null;
}

function getNormalizedSymbolOrError(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol || !isValidSymbol(symbol)) {
    return {
      error: "Invalid symbol. Symbol must be non-empty and alphanumeric.",
      symbol: null,
    };
  }

  return { error: null, symbol };
}

const sentimentDb = {
  async addToWatchlist(symbol, req) {
    const userId = String(req?.user?.id || "").trim();
    if (!userId) {
      throw new Error("Missing req.user.id while adding watchlist symbol");
    }

    await addToWatchList(userId, symbol);
  },

  async removeFromWatchlist(symbol, req) {
    const userId = String(req?.user?.id || "").trim();
    if (!userId) {
      throw new Error("Missing req.user.id while removing watchlist symbol");
    }

    await removeFromWatchList(userId, symbol);
  },

  async getHistory(symbol) {
    return getSnapshotHistory(symbol);
  },
};

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
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const user = req.user
    ? { id: req.user.id, tenantId: req.user.tenantId }
    : null;

  console.log("[ROUTE] POST /api/sentiment/watchlist called", {
    rawSymbol,
    normalized: symbol,
    user,
    body: req.body,
  });

  const validationReason = getSymbolValidationReason(rawSymbol);
  if (validationReason) {
    return res.status(400).json({
      error: "Invalid symbol",
      reason: validationReason,
    });
  }

  try {
    await addToWatchlist(symbol, req.user);
    return res.json({ success: true, symbol });
  } catch (err) {
    console.error("[ROUTE ERROR] sentimentRoute:addToWatchlist", {
      symbol,
      user,
      message: err?.message,
      stack: err?.stack,
    });

    return res.status(500).json({
      error: "Failed to add watchlist symbol",
      details: err?.message || "Unknown error",
    });
  }
});

router.delete("/watchlist/:symbol", async (req, res) => {
  try {
    const { error, symbol } = getNormalizedSymbolOrError(req.params.symbol);

    if (error) {
      return res.status(400).json({ error });
    }

    await sentimentDb.removeFromWatchlist(symbol, req);

    return res.json({ success: true, symbol });
  } catch (err) {
    const statusCode = Number(err?.statusCode || err?.status || 500);

    if (statusCode === 404) {
      console.error("Sentiment watchlist remove not found:", err?.message);
      return res.status(404).json({
        error: "Watchlist symbol not found",
        symbol: normalizeSymbol(req.params.symbol),
      });
    }

    console.error("Sentiment watchlist remove error:", err);
    return res.status(500).json({
      error: "Failed to remove symbol from watchlist",
      message: err?.message || "Unexpected sentiment watchlist remove error",
    });
  }
});

// GET latest sentiment snapshot
router.get("/latest/:ticker", async (req, res) => {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    if (!ticker) {
      return res.status(400).json({ error: "Ticker is required" });
    }

    const snapshot = await getLatestSnapshot(ticker);
    if (!snapshot) {
      return res.status(404).json({ error: "No sentiment data found" });
    }

    return res.json(snapshot);
  } catch (err) {
    console.error("[API ERROR] /api/sentiment/latest", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET sentiment history
router.get("/history/:ticker", async (req, res) => {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    let days = Number(req.query.days || 30);

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      days = 30;
    }

    if (!ticker) {
      return res.status(400).json({ error: "Ticker is required" });
    }

    const history = await getSnapshotHistory(ticker, days);
    return res.json(history);
  } catch (err) {
    console.error("[API ERROR] /api/sentiment/history", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:symbol/history", async (req, res) => {
  try {
    const { error, symbol } = getNormalizedSymbolOrError(req.params.symbol);

    if (error) {
      return res.status(400).json({ error });
    }

    const history = await sentimentDb.getHistory(symbol);
    return res.json(history);
  } catch (err) {
    console.error("Sentiment history error:", err);
    return res.status(500).json({
      error: "Failed to load sentiment history",
      message: err?.message || "Unexpected sentiment history error",
    });
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
