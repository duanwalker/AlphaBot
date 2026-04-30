import Anthropic from "@anthropic-ai/sdk";
import { fetchStockTwitsPosts } from "./stocktwitsService.js";
import { fetchRedditPosts } from "./redditService.js";
import { scorePosts } from "./finbertService.js";
import { persistSnapshot } from "./sentimentDb.js";
import { buildCacheKey, getOrSetCache, SENTIMENT_TTL } from "./cache.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase();
}

function uniqueTextKey(post) {
  return String(post?.text || "")
    .trim()
    .toLowerCase();
}

function takeUnique(posts, limit, seenTexts, selected) {
  for (const post of posts) {
    if (selected.length >= limit) {
      break;
    }

    const textKey = uniqueTextKey(post);
    if (!textKey || seenTexts.has(textKey)) {
      continue;
    }

    seenTexts.add(textKey);
    selected.push(post);
  }
}

export function selectTop30(posts = []) {
  const seenTexts = new Set();
  const selected = [];
  const uniquePosts = posts.filter((post) => uniqueTextKey(post));

  const byEngagement = [...uniquePosts].sort((left, right) => (right.engagement || 0) - (left.engagement || 0));
  const byBullish = [...uniquePosts].sort((left, right) => (right.finbertScore || 0) - (left.finbertScore || 0));
  const byBearish = [...uniquePosts].sort((left, right) => (left.finbertScore || 0) - (right.finbertScore || 0));
  const byRecent = [...uniquePosts].sort(
    (left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  );

  takeUnique(byEngagement, 10, seenTexts, selected);
  takeUnique(byBullish, 16, seenTexts, selected);
  takeUnique(byBearish, 22, seenTexts, selected);
  takeUnique(byRecent, 26, seenTexts, selected);
  takeUnique(byEngagement, 30, seenTexts, selected);

  return selected.slice(0, 30);
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeAgentPayload(raw = {}) {
  return {
    sentimentScore: Number(raw.sentimentScore ?? 0),
    signalStrength: raw.signalStrength || "low",
    trend: raw.trend || "stable",
    bullBearRatio: Number(raw.bullBearRatio ?? 0),
    positiveDrivers: Array.isArray(raw.positiveDrivers) ? raw.positiveDrivers : [],
    negativeDrivers: Array.isArray(raw.negativeDrivers) ? raw.negativeDrivers : [],
    notablePosts: Array.isArray(raw.notablePosts) ? raw.notablePosts : [],
    agentConfidence: raw.agentConfidence || "low",
    reasoning: raw.reasoning || "",
  };
}

export async function runSentimentAgent(ticker, top30Posts) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    temperature: 0.2,
    system: `You are a market sentiment analyst for AlphaBot. Analyze the supplied social posts for a single ticker and return only valid JSON.

Use this exact JSON schema:
{
  "sentimentScore": 0.0,
  "signalStrength": "low|moderate|high",
  "trend": "rising|falling|stable",
  "bullBearRatio": 0.0,
  "positiveDrivers": [""],
  "negativeDrivers": [""],
  "notablePosts": [
    { "text": "", "engagement": 0, "source": "" }
  ],
  "agentConfidence": "low|medium|high",
  "reasoning": ""
}

Rules:
- Return JSON only. Do not wrap in markdown.
- sentimentScore and bullBearRatio must be numeric values between 0 and 1.
- notablePosts must contain only posts from the provided dataset.
- positiveDrivers and negativeDrivers should be concise strings.
- reasoning should be concise and grounded only in the provided posts.
- If evidence is mixed, lower the confidence and moderate the signal strength.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({ ticker, posts: top30Posts }, null, 2),
          },
        ],
      },
    ],
  });

  const text = response.content?.[0]?.text || "{}";
  const parsed = JSON.parse(extractJsonObject(text));
  return normalizeAgentPayload(parsed);
}

export function computeVolumeVsAvg(ticker, currentVolume) {
  return 0;
}

export async function runSentimentPipeline(ticker) {
  const normalizedTicker = normalizeTicker(ticker);

  const [stocktwitsPosts, redditPosts] = await Promise.all([
    fetchStockTwitsPosts(normalizedTicker),
    fetchRedditPosts(normalizedTicker),
  ]);
  const allPosts = [...stocktwitsPosts, ...redditPosts];

  const scoredPosts = await scorePosts(allPosts);
  const top30Posts = selectTop30(scoredPosts);
  const agentPayload = await runSentimentAgent(normalizedTicker, top30Posts);

  const payload = {
    ticker: normalizedTicker,
    timestamp: new Date().toISOString(),
    postVolume: allPosts.length,
    volumeVsAvgPct: computeVolumeVsAvg(normalizedTicker, allPosts.length),
    ...agentPayload,
  };

  persistSnapshot(payload).catch((err) => {
    console.error(`Sentiment snapshot persist failed for ${normalizedTicker}:`, err.message);
  });

  return payload;
}

export async function getSentiment(ticker, userId, tenantId) {
  const normalizedTicker = normalizeTicker(ticker);
  const cacheKey = buildCacheKey("sentiment", [normalizedTicker]);

  return getOrSetCache(cacheKey, SENTIMENT_TTL, async () => runSentimentPipeline(normalizedTicker));
}
