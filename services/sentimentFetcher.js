import * as redditService from "./redditService.js";
import * as stocktwitsService from "./stocktwitsService.js";
import * as finbertService from "./finbertService.js";

const SYMBOL_PATTERN = /^[A-Z0-9]+$/;

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function validateAndNormalizeSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized || !SYMBOL_PATTERN.test(normalized)) {
    throw new Error("Invalid symbol. Symbol must be non-empty and alphanumeric.");
  }

  return normalized;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePost(post = {}) {
  return {
    text: String(post.text || "").trim(),
    source: post.source || "unknown",
    engagement: toFiniteNumber(post.engagement, 0),
    createdAt: post.createdAt || null,
  };
}

async function getRedditPosts(symbol) {
  if (typeof redditService.getRedditPosts === "function") {
    return redditService.getRedditPosts(symbol);
  }

  if (typeof redditService.fetchRedditPosts === "function") {
    return redditService.fetchRedditPosts(symbol);
  }

  throw new Error("redditService is missing getRedditPosts(symbol)");
}

async function getStocktwitsPosts(symbol) {
  if (typeof stocktwitsService.getStocktwitsPosts === "function") {
    return stocktwitsService.getStocktwitsPosts(symbol);
  }

  if (typeof stocktwitsService.fetchStockTwitsPosts === "function") {
    return stocktwitsService.fetchStockTwitsPosts(symbol);
  }

  throw new Error("stocktwitsService is missing getStocktwitsPosts(symbol)");
}

function normalizeScoredPost(post = {}) {
  const sentiment = String(post.finbertSentiment || post.sentiment || "neutral").toLowerCase();

  return {
    ...normalizePost(post),
    sentiment: ["positive", "negative", "neutral"].includes(sentiment) ? sentiment : "neutral",
    score: toFiniteNumber(post.finbertScore ?? post.score, 0),
    confidence: toFiniteNumber(post.finbertConfidence ?? post.confidence, 0),
  };
}

async function analyzePostSentiment(posts) {
  if (!posts.length) {
    return [];
  }

  if (typeof finbertService.analyzeSentiment === "function") {
    const scored = [];

    for (const post of posts) {
      const analysis = await finbertService.analyzeSentiment(post.text);
      scored.push(
        normalizeScoredPost({
          ...post,
          sentiment: analysis?.sentiment,
          score: analysis?.score,
          confidence: analysis?.confidence,
        })
      );
    }

    return scored;
  }

  if (typeof finbertService.scorePosts === "function") {
    const scoredPosts = await finbertService.scorePosts(posts);
    return scoredPosts.map((post) => normalizeScoredPost(post));
  }

  throw new Error("finbertService is missing analyzeSentiment(text)");
}

function buildPostSummary(post) {
  return {
    text: post.text,
    source: post.source,
    score: post.score,
    confidence: post.confidence,
    engagement: post.engagement,
    createdAt: post.createdAt,
  };
}

function selectTopPosts(posts, sentiment, limit = 5) {
  const filtered = posts.filter((post) => post.sentiment === sentiment);
  const sorted = [...filtered].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return right.engagement - left.engagement;
  });

  if (sentiment === "negative") {
    sorted.sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return right.engagement - left.engagement;
    });
  }

  return sorted.slice(0, limit).map(buildPostSummary);
}

function aggregateSentiment(scoredPosts) {
  const counts = {
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
  };

  let scoreTotal = 0;

  for (const post of scoredPosts) {
    scoreTotal += post.score;

    if (post.sentiment === "positive") {
      counts.positiveCount += 1;
    } else if (post.sentiment === "negative") {
      counts.negativeCount += 1;
    } else {
      counts.neutralCount += 1;
    }
  }

  const sampleSize = scoredPosts.length;
  const averageScore = sampleSize ? Number((scoreTotal / sampleSize).toFixed(4)) : 0;

  return {
    averageScore,
    sampleSize,
    ...counts,
  };
}

export async function fetchSentimentSnapshot(symbol) {
  const normalizedSymbol = validateAndNormalizeSymbol(symbol);

  try {
    const [redditPosts, stocktwitsPosts] = await Promise.all([
      getRedditPosts(normalizedSymbol),
      getStocktwitsPosts(normalizedSymbol),
    ]);

    const combinedPosts = [...(redditPosts || []), ...(stocktwitsPosts || [])]
      .map((post) => normalizePost(post))
      .filter((post) => post.text);

    const scoredPosts = await analyzePostSentiment(combinedPosts);
    const sentiment = aggregateSentiment(scoredPosts);

    return {
      symbol: normalizedSymbol,
      timestamp: new Date().toISOString(),
      averageScore: sentiment.averageScore,
      positiveCount: sentiment.positiveCount,
      negativeCount: sentiment.negativeCount,
      neutralCount: sentiment.neutralCount,
      sampleSize: sentiment.sampleSize,
      topPositivePosts: selectTopPosts(scoredPosts, "positive"),
      topNegativePosts: selectTopPosts(scoredPosts, "negative"),
    };
  } catch (err) {
    throw new Error(
      `Failed to fetch sentiment snapshot for ${normalizedSymbol}: ${err?.message || "unknown error"}`
    );
  }
}
