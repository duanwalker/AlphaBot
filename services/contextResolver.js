const COMMON_WORDS = new Set([
  // Articles / prepositions / conjunctions
  'a', 'an', 'the', 'of', 'in', 'at', 'to', 'on', 'or', 'as', 'by',
  'is', 'it', 'if', 'be', 'am', 'we', 'my', 'me', 'no', 'so', 'do',
  'go', 'up', 'ok', 'hi', 'vs',
  // Filler / question words
  'how', 'what', 'when', 'will', 'would', 'from', 'with', 'some',
  'hey', 'per', 'via', 're',
  // Finance jargon that looks like tickers
  'etf', 'ipo', 'eps', 'pe', 'iv', 'dte', 'otm', 'itm',
  // Action / sentiment words
  'buy', 'sell', 'good', 'bad', 'high', 'low', 'best', 'top', 'more',
  'less', 'think', 'doing', 'going', 'trade', 'stock', 'call', 'put',
  // Market / topic words
  'news', 'tech', 'sector', 'market', 'today', 'tomorrow', 'week',
]);

function extractTickerFromMessage(message) {
  const tokens = message
    .toUpperCase()
    .split(/[\s,.$@!?;:()\[\]{}'"\/\\]+/)
    .filter(Boolean);

  const candidates = [];

  for (const token of tokens) {
    // Must be 2-5 uppercase letters only
    if (!/^[A-Z]{2,5}$/.test(token)) continue;

    // Must not be a common word (check lowercase)
    if (COMMON_WORDS.has(token.toLowerCase())) continue;

    candidates.push(token);
  }

  if (candidates.length === 0) return null;

  // Prefer longer tokens (tickers tend to be 3-5 chars)
  // If tie, take the last one found (tickers usually come after context words)
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

export function resolveContext(uiSymbol, message) {
  // UI-provided symbol always wins — Research/Options/Sentiment tabs set this
  if (uiSymbol) {
    return { mode: 'single', symbol: uiSymbol.toUpperCase() };
  }

  // Fallback: did they mention a ticker in the chat message?
  const mentioned = extractTickerFromMessage(message || '');
  if (mentioned) {
    return { mode: 'single', symbol: mentioned };
  }

  // No symbol anywhere — market mode
  return { mode: 'market', symbol: null };
}
