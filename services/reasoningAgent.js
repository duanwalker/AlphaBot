import Anthropic from "@anthropic-ai/sdk";

const REASONING_PROMPT = "You are a sentiment reasoning agent. Your job is to read a noisy social media post and produce a clean, single-sentence summary of the user's sentiment about the stock. Ignore memes, GIFs, images, URLs, HTML, JSON fragments, and formatting noise. Extract the meaning, not the noise. Detect sarcasm. Interpret emojis. Output ONLY the cleaned summary with no explanation.";
const DEFAULT_SUMMARY = "The post expresses no clear sentiment about the stock.";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function extractResponseText(response) {
  const parts = Array.isArray(response?.content) ? response.content : [];
  const text = parts
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return text;
}

export async function analyzePost(text) {
  const rawText = typeof text === "string" ? text : String(text ?? "");

  if (!rawText.trim()) {
    return DEFAULT_SUMMARY;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude reasoning agent is unavailable: ANTHROPIC_API_KEY is not configured.");
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      temperature: 0,
      system: REASONING_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: rawText,
            },
          ],
        },
      ],
    });

    const summary = extractResponseText(response);

    if (!summary) {
      throw new Error("Claude returned an empty summary.");
    }

    return summary;
  } catch (error) {
    throw new Error(`Claude reasoning agent failed: ${error?.message || "unknown error"}`);
  }
}
