// services/systemPrompts.js
import { getSentimentReliability } from './compressionService.js';

// ── Strategy Registry ──────────────────────────────────────
// Single source of truth for all supported strategies.
// Add new strategies here; no other code needs to change.
const STRATEGY_REGISTRY = {

  // ── Income Strategies ────────────────────────────────────

  wheel_strategy: {
    id: 'wheel_strategy',
    name: 'Wheel Strategy',
    category: 'income',
    complexity: 'intermediate',
    minExperience: 'sold_calls',
    capitalMin: 2500,
    timeCommitment: 'weekly',
    guide: `
WHEEL STRATEGY REASONING GUIDE:
The wheel is a systematic income strategy: sell CSPs on stocks you want to own, collect premium.
If assigned, sell covered calls to generate more income until shares are called away, then repeat.

Stock selection criteria:
  - Stocks you genuinely want to own at the strike price
  - Sufficient option liquidity (bid/ask spread < $0.10)
  - IV rank > 30% (elevated premium environment)
  - Market cap > $1B (avoid illiquid small caps for execution)
  - Stable or gently rising trend preferred
  - Avoid: pre-earnings unless intentional, highly volatile biotech/clinical-stage companies, penny stocks

Strike selection for CSPs:
  - Target 0.20-0.30 delta (approximately 20-30% chance of being assigned at expiry)
  - Strike should be at or below a support level
  - Premium should be at least 1% of strike price for 30-day expiry (12%+ annualized)
  - Avoid strikes below strong support levels

Expiry selection:
  - 21-45 days to expiry is the sweet spot
  - Theta decay accelerates in final 21 days
  - Avoid expiry through earnings unless intentional

Position sizing:
  - Never allocate more than 20% of portfolio to one wheel position
  - Cash secured means having 100% of strike × contracts in buying power
  - Example: $185 strike × 1 contract = $18,500 secured

Premium targets:
  - Minimum 1% per 30 days = 12% annualized
  - High IV periods (VIX > 20) offer better premiums
  - Calculate: (premium / strike) × (365 / DTE) × 100

When assigned (stock dropped below strike):
  - Do NOT panic sell — assignment means you bought at your predetermined price
  - Immediately evaluate selling covered calls
  - Strike for CC: above your cost basis (cost basis = strike - premium received)
  - If fundamentals have changed materially, reassess

Sentiment role in wheel strategy:
  - Confirmation tool, NOT price prediction
  - HIGH value: sentiment rising + high signal strength → supports selling CSP
  - HIGH value: sentiment falling + bearish trend → delay entry, wait for stabilization
  - LOW value for large caps (AAPL, MSFT, NVDA, AMZN) → use technicals instead
  - MEDIUM value for mid caps ($5B-$50B market cap)
  - HIGH value for small caps (< $5B market cap)

When to roll vs close:
  - Roll when: position is at 21 DTE with profit available, stock has moved against you but thesis intact
  - Close when: 50% of max profit reached early (take profit, redeploy capital)
  - Close when: fundamental thesis has changed
`,
  },

  covered_calls: {
    id: 'covered_calls',
    name: 'Covered Calls',
    category: 'income',
    complexity: 'beginner',
    minExperience: 'bought',
    capitalMin: 1000,
    timeCommitment: 'weekly',
    guide: `
COVERED CALLS REASONING GUIDE:
User owns shares and sells call options above current price to generate monthly income.
The premium is collected immediately. If stock stays below strike at expiry, keep premium and shares.
If stock rises above strike, shares are "called away" at the strike price.

CRITICAL: Always check if user already owns the symbol before suggesting covered calls.
If they own 100+ shares, covered calls are directly applicable.

Strike selection:
  - Target 0.20-0.30 delta (OTM calls)
  - Strike should be above your cost basis — NEVER below
  - Strike should be above a resistance level if possible
  - Use sentiment to adjust: rising sentiment → further OTM (don't cap upside when momentum is building)

What to avoid:
  - DO NOT sell calls through earnings dates (IV crush works against you if stock moves up)
  - DO NOT sell calls if user expects near-term price surge
  - DO NOT sell calls below cost basis (creates loss risk)
  - Watch ex-dividend dates: if stock is called away before ex-div, user misses the dividend

Rolling covered calls:
  - If stock approaches strike before expiry:
    Roll up and out (buy back current call, sell further OTM at later expiry for net credit)
  - Roll to maintain position without being called away

Sentiment role in covered calls:
  - Moderate relevance
  - Bullish/rising sentiment → sell further OTM strike (protect upside participation)
  - Bearish/falling sentiment → sell closer to money (capture more premium when stock likely to stall)
  - Neutral sentiment → standard 0.25 delta target
`,
  },

  cash_secured_puts: {
    id: 'cash_secured_puts',
    name: 'Cash-Secured Puts',
    category: 'income',
    complexity: 'intermediate',
    minExperience: 'bought',
    capitalMin: 1000,
    timeCommitment: 'weekly',
    guide: `
CASH-SECURED PUTS REASONING GUIDE:
Sell put options secured by enough cash to buy 100 shares if assigned.
Generates income while waiting for a stock to reach your desired entry price.

IMPORTANT distinction from wheel strategy:
  - Standalone CSPs may NOT want assignment
  - Must clarify: "are you OK being assigned these shares?"
  - If not OK with assignment → do not sell CSPs

Best use cases:
  - Bullish on a stock but want a lower entry price
  - Generate income while waiting for pullback
  - Complement to existing DCA strategy

Best entry conditions:
  - Stock has pulled back to support level
  - IV is elevated (better premium)
  - Your thesis on the stock is intact
  - You have capital to secure the full position

Sentiment role:
  - Higher weight than covered calls since direction matters more for CSPs
  - Positive/stable sentiment → supports selling put
  - Falling/negative sentiment → wait for stabilization
  - Strongly bearish sentiment → avoid (stock may fall further, forcing assignment at bad price)

Close criteria:
  - Standard practice: close at 50% of max profit
  - Redeploy capital to next opportunity
  - Never hold to expiry unless you want assignment
`,
  },

  iron_condor: {
    id: 'iron_condor',
    name: 'Iron Condor',
    category: 'income',
    complexity: 'advanced',
    minExperience: 'advanced',
    capitalMin: 5000,
    timeCommitment: 'weekly',
    guide: `
IRON CONDOR REASONING GUIDE:
Sell an OTM put spread AND an OTM call spread simultaneously.
Profit when stock stays within a range (between the two short strikes) until expiry.

Structure:
  - Sell OTM put (lower short strike)
  - Buy further OTM put (lower long strike = protection)
  - Sell OTM call (upper short strike)
  - Buy further OTM call (upper long strike = protection)
  - Max profit: net premium received (stock in range)
  - Max loss: width of spread - premium received

Best conditions for iron condors:
  - High IV environment (VIX > 20) — sell premium
  - Stock in sideways/consolidating trend
  - No major catalysts expected (earnings, FDA etc)
  - Liquid options market (liquid ETFs ideal: SPY, QQQ, IWM)
  - Neutral sentiment — neither strongly bullish nor strongly bearish

Strike selection:
  - Short strikes at 0.15-0.20 delta each side (roughly 1-2 standard deviations OTM)
  - Spread width: typically $5-$10 for most stocks
  - Premium target: 1/3 of spread width or more

Adjustment and management:
  - Close at 50% of max profit (standard)
  - Adjust if short strike threatened: roll the threatened side out and away
  - Close entire position if loss reaches 2x premium
  - Never hold through earnings

Sentiment role:
  - CRITICAL for condor: need neutral sentiment
  - Strongly bullish sentiment → condor is wrong strategy (stock likely to break out upward)
  - Strongly bearish sentiment → condor is wrong strategy (stock likely to break down)
  - Mixed/neutral sentiment → supports condor
  - Best symbols: index ETFs where sentiment is less meaningful (market-wide neutral)

Experience requirement:
  - Only suggest to users with 'advanced' options experience in their profile
  - Flag clearly if user's experience level is lower
`,
  },

  bull_call_spread: {
    id: 'bull_call_spread',
    name: 'Bull Call Spread',
    category: 'income',
    complexity: 'intermediate',
    minExperience: 'bought',
    capitalMin: 500,
    timeCommitment: 'weekly',
    guide: `
BULL CALL SPREAD REASONING GUIDE:
Buy a lower strike call, sell a higher strike call.
Defined risk bullish play — cheaper than buying a naked call, with capped upside.

Structure:
  - Buy ATM or slightly OTM call (lower strike)
  - Sell further OTM call (upper strike)
  - Max profit: (spread width - net debit) × 100
  - Max loss: net debit paid
  - Break even: lower strike + net debit

Best conditions:
  - Moderately bullish outlook (not explosive)
  - Elevated IV makes naked calls expensive → spread reduces cost
  - Clear upside target in mind (stock to $X)
  - Earnings catalyst expected with upside bias

Strike selection:
  - Lower strike: ATM or 0.40-0.50 delta
  - Upper strike: at resistance or target price
  - Typical spread width: $5-$10
  - Target: spread costs 30-40% of width (max profit = 1.5x-2x the risk)

Sentiment role:
  - HIGH relevance — direction matters completely
  - Strong bullish sentiment + high signal → supports bull call spread entry
  - Use for: mid/small caps where sentiment leads price
  - Avoid: large caps where sentiment lags price
`,
  },

  bear_put_spread: {
    id: 'bear_put_spread',
    name: 'Bear Put Spread',
    category: 'hedge',
    complexity: 'intermediate',
    minExperience: 'bought',
    capitalMin: 500,
    timeCommitment: 'weekly',
    guide: `
BEAR PUT SPREAD REASONING GUIDE:
Buy a higher strike put, sell a lower strike put.
Defined risk bearish play or hedge on existing positions.

Structure:
  - Buy ATM or slightly OTM put (higher strike)
  - Sell further OTM put (lower strike = protection)
  - Max profit: (spread width - net debit) × 100
  - Max loss: net debit paid
  - Break even: higher strike - net debit

Best use cases:
  - Bearish directional bet on a stock
  - Hedging existing long position (portfolio protection)
  - Protecting wheel positions approaching assignment

Sentiment role:
  - HIGH relevance for directional bet
  - Falling/bearish sentiment + high signal → supports bear put spread entry
  - For hedging: less sentiment-dependent — hedge when you're worried regardless of sentiment
`,
  },

  protective_put: {
    id: 'protective_put',
    name: 'Protective Put',
    category: 'hedge',
    complexity: 'beginner',
    minExperience: 'bought',
    capitalMin: 200,
    timeCommitment: 'passive',
    guide: `
PROTECTIVE PUT REASONING GUIDE:
Buy a put option on a stock you already own. Acts as insurance — limits downside while keeping full upside.

Best use cases:
  - Portfolio insurance before uncertain events
  - Protecting gains on a large position
  - Protecting wheel assignments during volatile periods

Cost consideration:
  - Protective puts cost premium — reduces net return
  - Use sparingly, for high-conviction protection needs
  - Consider collar (sell covered call to fund put) to reduce net cost of protection

Sentiment role:
  - Moderately relevant
  - Falling/bearish sentiment on owned position → consider protective put
  - High IV makes puts expensive → consider timing
`,
  },

  collar: {
    id: 'collar',
    name: 'Collar',
    category: 'hedge',
    complexity: 'intermediate',
    minExperience: 'sold_calls',
    capitalMin: 1000,
    timeCommitment: 'weekly',
    guide: `
COLLAR REASONING GUIDE:
Own shares + buy protective put + sell covered call.
The covered call premium funds the put purchase. Creates a defined range for the position.

Structure:
  - Own 100 shares
  - Buy OTM put (downside protection)
  - Sell OTM call (funds the put, caps upside)
  - Net cost: often near zero (put funded by call premium)

Best use cases:
  - Lock in gains on a winning position
  - Protect a large position ahead of uncertainty
  - Transitioning out of a position over time

Sentiment role:
  - Moderate — use collar when sentiment turns negative on a position you want to protect but not sell
`,
  },

  leaps: {
    id: 'leaps',
    name: 'LEAPS (Long-term Options)',
    category: 'growth',
    complexity: 'intermediate',
    minExperience: 'bought',
    capitalMin: 500,
    timeCommitment: 'passive',
    guide: `
LEAPS REASONING GUIDE:
Long-dated call options (1-2 years expiry) used as leveraged stock replacement.
Less capital than buying shares outright with similar upside exposure.

Best use cases:
  - Bullish long-term thesis on a stock
  - Capital efficient alternative to stock ownership
  - Poor Man's Covered Call (PMCC) base position

Strike selection:
  - Buy deep ITM calls (0.70-0.90 delta)
  - Expiry: 12-24 months out
  - Avoid very high IV (makes LEAPS expensive)

PMCC strategy:
  - Buy deep ITM LEAPS as stock replacement
  - Sell short-dated OTM calls against it monthly
  - Similar to covered calls but requires less capital
  - Credit from short calls pays for LEAPS over time

Sentiment role:
  - Moderate relevance
  - Long time horizon reduces single sentiment reading
  - Use fundamental thesis primarily
  - Sentiment as secondary confirmation for entry timing
`,
  },

  straddle_strangle: {
    id: 'straddle_strangle',
    name: 'Straddle / Strangle',
    category: 'growth',
    complexity: 'advanced',
    minExperience: 'advanced',
    capitalMin: 1000,
    timeCommitment: 'daily',
    guide: `
STRADDLE / STRANGLE REASONING GUIDE:
Buy both a call and a put. Profit when stock makes a large move in either direction. Direction agnostic.

Straddle: buy ATM call + ATM put (same strike)
Strangle: buy OTM call + OTM put (different strikes — cheaper but needs bigger move to profit)

Best conditions:
  - Low IV currently (options cheap)
  - Catalyst expected: earnings, FDA decision, merger/acquisition announcement
  - Stock historically makes big moves on catalysts
  - Uncertain direction but high conviction on magnitude

CRITICAL: Buy BEFORE IV rises (before catalyst announced widely).
  Buying after IV spikes = overpaying.

Sentiment role:
  - LOW relevance for direction (strategy is neutral)
  - Use to gauge retail excitement around catalyst:
    High sentiment + catalyst approaching = more retail participation = potentially bigger move
  - Extreme sentiment either direction can signal move magnitude (crowd positioning)

Experience requirement:
  - Only for advanced users — significant risk of losing full premium if stock stays flat
`,
  },

  index_dca: {
    id: 'index_dca',
    name: 'Index Fund DCA',
    category: 'passive',
    complexity: 'beginner',
    minExperience: 'none',
    capitalMin: 100,
    timeCommitment: 'passive',
    guide: `
INDEX DCA REASONING GUIDE:
Regular, scheduled purchases of broad market index ETFs regardless of price.
Removes emotion from investing.

SENTIMENT SIGNAL: NOT APPLICABLE for index ETFs.
VTI, SCHD, QQQ, SPY etc have no meaningful social media sentiment signal.
Do NOT cite sentiment scores for these symbols — they reflect price, not lead it.

Relevant factors for index DCA:
  - Current price vs 52-week range (buying opportunity?)
  - Market valuation (P/E of index vs historical average)
  - DCA schedule adherence (consistency matters most)
  - Dividend yield (SCHD, VYM, VIG for income focus)
  - Expense ratio (lower is better, Vanguard/Schwab win)

Recommended ETFs by goal:
  Total market:      VTI (Vanguard) or ITOT (iShares)
  Dividend income:   SCHD (Schwab) — quality dividend growth
  High yield:        VYM (Vanguard) — higher current yield
  Dividend growth:   VIG (Vanguard) — companies growing div
  International:     VXUS or VEU
  Bonds:             BND or AGG (reduce volatility)
  Nasdaq/tech:       QQQ (higher risk/reward)

DCA guidance:
  - Stick to schedule — time IN market beats timing
  - Increase purchases during significant drawdowns (VIX > 30 = consider accelerating DCA)
  - Rebalance quarterly if allocation drifts > 5%
  - Reinvest dividends automatically (DRIP)

Key metrics to surface:
  - Current dividend yield
  - Next ex-dividend date
  - YTD performance vs benchmark
  - Cost basis vs current price
`,
  },

  dividend_income: {
    id: 'dividend_income',
    name: 'Dividend Income',
    category: 'passive',
    complexity: 'beginner',
    minExperience: 'none',
    capitalMin: 500,
    timeCommitment: 'passive',
    guide: `
DIVIDEND INCOME REASONING GUIDE:
Build a portfolio of dividend-paying stocks and ETFs to generate regular passive income.

SENTIMENT SIGNAL: LOW relevance for most dividend stocks.
Dividend stocks (utilities, REITs, consumer staples) are heavily institutional-owned.
Social sentiment lags price. Focus on fundamentals and dividend health metrics.

Dividend health checklist (surface these):
  - Payout ratio: under 60% is sustainable (exception: REITs can pay up to 90%)
  - Dividend growth rate (CAGR over 5 years) — growing dividend = inflation protection
  - Consecutive years of dividend increases (Dividend Aristocrats = 25+ years)
  - Free cash flow coverage of dividend (FCF > dividend payment = healthy)
  - Debt levels (high debt = dividend cut risk)

Red flags for dividend cuts:
  - Payout ratio > 80% for non-REITs
  - Declining revenue or earnings
  - High debt in rising interest rate environment
  - Company using debt to pay dividend

Sector considerations:
  - Utilities: stable but rate-sensitive
  - REITs: high yield, rate-sensitive
  - Consumer staples: most stable
  - Energy: high yield but cyclical
  - Financials: banks/insurers, economic cycle risk

Key dates to surface:
  - Next ex-dividend date (must own shares BEFORE this)
  - Payment date
  - Annual dividend income projection (shares × annual dividend per share)

Interest rate context:
  - Rising rates → dividend stocks fall in value (bonds become more competitive)
  - High rates = reassess dividend vs bond allocation
`,
  },

  growth_investing: {
    id: 'growth_investing',
    name: 'Growth Investing',
    category: 'growth',
    complexity: 'intermediate',
    minExperience: 'none',
    capitalMin: 500,
    timeCommitment: 'weekly',
    guide: `
GROWTH INVESTING REASONING GUIDE:
Buy and hold companies with high revenue growth rates, large addressable markets,
and strong competitive moats. Accept higher volatility for higher long-term returns.

SENTIMENT SIGNAL: MODERATE to HIGH relevance.
Growth stocks are often retail-driven (AI stocks, EV, biotech).
Social sentiment can lead price for smaller growth names. Use carefully for large-cap growth.

Key metrics for growth stocks:
  - Revenue growth rate (YoY) — looking for 20%+
  - Gross margin (higher = better business model)
  - TAM (total addressable market — is there room to grow?)
  - Rule of 40: revenue growth % + profit margin %
    If > 40, strong growth company
  - Price/Sales ratio vs peers (growth stocks often unprofitable — P/E less useful)
  - Net Revenue Retention (for SaaS companies)

Valuation framework:
  - P/E less relevant for unprofitable growth companies
  - Use EV/Revenue or EV/Gross Profit for comparison
  - Compare to sector peers not broad market
  - DCF analysis requires many assumptions — handle with appropriate uncertainty

Position sizing:
  - Growth stocks can drop 50%+ in corrections
  - Size accordingly: 2-5% per position max
  - Diversify across sectors and growth stages

Time horizon:
  - 3-5 year minimum holding period
  - Short-term volatility is noise at this time horizon
  - Reassess if fundamental thesis changes, not price

Sentiment role for growth stocks:
  - Earnings beats + bullish sentiment = momentum entry
  - New product/service launch + rising sentiment = potential catalyst play
  - Insider buying + positive sentiment = strong signal
  - Falling sentiment + multiple quarters of miss = time to reassess thesis
`,
  },

  options_spreads: {
    id: 'options_spreads',
    name: 'Options Spreads',
    category: 'income',
    complexity: 'advanced',
    minExperience: 'advanced',
    capitalMin: 2000,
    timeCommitment: 'weekly',
    guide: `
OPTIONS SPREADS REASONING GUIDE:
Defined-risk options strategies using combinations of bought and sold options.
Includes credit spreads (income) and debit spreads (directional bets).

Credit spreads (income-focused):
  - Bull put spread: sell higher put, buy lower put → bullish/neutral, collect premium
  - Bear call spread: sell lower call, buy higher call → bearish/neutral, collect premium
  - Iron condor: bull put spread + bear call spread → neutral, collect premium on both sides

Debit spreads (directional):
  - Bull call spread: buy lower call, sell higher call → bullish, defined cost
  - Bear put spread: buy higher put, sell lower put → bearish, defined cost

Key advantages over naked options:
  - Defined maximum loss (no unlimited risk)
  - Lower capital requirement than naked options
  - Reduced sensitivity to IV crush
  - Better for smaller accounts

Experience requirement:
  IMPORTANT: Only recommend spreads to users with 'advanced' options experience in their profile.
  If experience is 'none', 'bought', or 'sold_calls' → explain the strategy exists but recommend
  starting with simpler strategies first. Never skip this check.

Sentiment role:
  - Credit spreads: neutral/opposite sentiment supports
  - Debit spreads: directional sentiment alignment critical
  - See individual spread guides above for details
`,
  },
};

// Experience levels in ascending order for gate checks
const EXP_LEVELS = ['none', 'bought', 'sold_calls', 'advanced'];

function buildStrategyContext(profile, positions) {
  if (!profile?.onboardingCompleted) {
    return `Note: This user has not completed their strategy profile.
Provide thoughtful general analysis appropriate for a retail investor.
Occasionally (not every message) suggest they complete their profile
in Settings → Profile for personalized recommendations.`;
  }

  const activeStrategyIds = profile.activeStrategies || [];
  const riskLevel    = profile.strategyProfile?.riskLevel    || 'unknown';
  const goal         = profile.strategyProfile?.primaryGoal  || '';
  const horizon      = profile.strategyProfile?.timeHorizon  || '';
  const experience   = profile.questionnaire?.optionsExperience || 'none';
  const userExpIdx   = EXP_LEVELS.indexOf(experience);

  // Build guide block for each active strategy
  const strategyGuides = activeStrategyIds.map(id => {
    const entry = STRATEGY_REGISTRY[id];
    if (!entry) return `=== ${id} ===\n(Unknown strategy — no guide available)\n`;

    const minExpIdx = EXP_LEVELS.indexOf(entry.minExperience);
    const expWarning = (minExpIdx > userExpIdx)
      ? `\nEXPERIENCE GATE: This strategy requires "${entry.minExperience}" experience level.` +
        ` User is at "${experience}". Flag this in your response and suggest building up to it first.\n`
      : '';

    return `=== ${entry.name} (${entry.category}, ${entry.complexity}) ===${expWarning}${entry.guide}`;
  }).join('\n\n');

  // Position cross-reference block
  let positionBlock = '';
  if (Array.isArray(positions) && positions.length > 0) {
    const lines = positions.map(p => {
      const plStr = p.unrealizedPLPercent != null
        ? ` | P&L: ${parseFloat(p.unrealizedPLPercent).toFixed(1)}%`
        : '';
      return `  ${p.symbol}: ${p.qty} shares @ avg $${p.avgEntryPrice}, current $${p.currentPrice}${plStr}`;
    }).join('\n');

    positionBlock = `
CURRENT POSITIONS — cross-reference before recommending:
${lines}

POSITION CROSS-REFERENCE RULES:
- If the analyzed symbol is in positions AND user has covered_calls → lead with covered call strike suggestion
- If user has wheel_strategy and symbol is in positions after assignment → suggest selling covered calls above cost basis
- If suggesting a CSP on a symbol they already own → note they could sell covered calls instead
- If a position has a large unrealized gain → check whether collar or protective_put is appropriate
- Never recommend buying shares of something already held without acknowledging the existing position`;
  }

  const strategyNames = activeStrategyIds
    .map(id => STRATEGY_REGISTRY[id]?.name || id)
    .join(', ') || 'none';

  return `USER STRATEGY PROFILE:
Active strategies: ${strategyNames}
Risk level: ${riskLevel}/5
Primary goal: ${goal}
Time horizon: ${horizon}
Options experience: ${experience}
${positionBlock}

ACTIVE STRATEGY GUIDES:
${strategyGuides || '(No active strategies — provide general analysis)'}

BEHAVIORAL RULES:
- ONLY recommend strategies from the user's active strategies list above
- If the best opportunity matches a strategy the user does NOT have active, name it and say:
  "This uses [Strategy Name], which is not in your current profile"
- Respect experience gates — flag if a strategy requires more experience than the user has
- Apply the relevant strategy guide(s) when analyzing this symbol
- Tailor position sizing to risk level ${riskLevel}/5`;
}

export function getSingleSymbolPrompt(
  symbol,
  userProfile = null,
  enrichedContext = {}
) {
  const {
    marketCap,
    postVolume,
    existingPosition,
    upcomingEarnings,
    exDividendDate,
    currentIV,
    vixLevel,
  } = enrichedContext;

  // ── Sentiment reliability assessment ───────────────────
  const sentReliability = getSentimentReliability(
    marketCap, postVolume
  );

  // ── Determine applicable strategies for this symbol ────
  const activeStrategies = userProfile?.activeStrategies || [];
  const experience = userProfile?.questionnaire
    ?.optionsExperience || 'none';
  const riskLevel = userProfile?.strategyProfile
    ?.riskLevel || 3;

  // Filter strategies appropriate for this symbol context
  const applicableStrategies = activeStrategies.filter(id => {
    const strategy = STRATEGY_REGISTRY[id];
    if (!strategy) return false;
    // Check experience requirement
    const expLevels = ['none','bought','sold_calls','advanced'];
    const userExpIdx = expLevels.indexOf(experience);
    const reqExpIdx = expLevels.indexOf(
      strategy.minExperience
    );
    return userExpIdx >= reqExpIdx;
  });

  // Strategies user has selected but lacks experience for
  const experienceGappedStrategies = activeStrategies
    .filter(id => !applicableStrategies.includes(id))
    .filter(id => STRATEGY_REGISTRY[id]);

  // Build strategy guides for applicable strategies
  const strategyGuides = applicableStrategies
    .map(id => STRATEGY_REGISTRY[id]?.guide || '')
    .filter(Boolean)
    .join('\n\n');

  // ── Position context ────────────────────────────────────
  const positionContext = existingPosition
    ? `EXISTING POSITION: User owns ${existingPosition.qty} ` +
      `shares of ${symbol} at avg cost ` +
      `$${existingPosition.avgCost}. ` +
      `Current P/L: ${existingPosition.unrealizedPLPercent}%. ` +
      `This means covered calls are directly applicable ` +
      `if user has 100+ shares.`
    : `No existing position in ${symbol}.`;

  // ── Catalyst context ────────────────────────────────────
  const catalystContext = [];
  if (upcomingEarnings) {
    catalystContext.push(
      `EARNINGS in ${upcomingEarnings} days — ` +
      `avoid selling options through this date unless ` +
      `intentionally playing the catalyst. IV will be ` +
      `elevated before earnings then crush after.`
    );
  }
  if (exDividendDate) {
    catalystContext.push(
      `EX-DIVIDEND DATE: ${exDividendDate} — ` +
      `if user wants the dividend, must own shares before ` +
      `this date. Do not sell covered calls that expire ` +
      `after ex-div if assignment risk exists.`
    );
  }

  // ── Experience gap warnings ─────────────────────────────
  const expGapWarning = experienceGappedStrategies.length > 0
    ? `\nEXPERIENCE NOTE: User has selected ` +
      `${experienceGappedStrategies.map(id =>
        STRATEGY_REGISTRY[id]?.name
      ).join(', ')} but their stated experience level ` +
      `(${experience}) may not support these strategies. ` +
      `Mention these exist but recommend building experience ` +
      `with simpler strategies first.`
    : '';

  return `You are AlphaBot, an AI trading assistant
embedded in a personal trading dashboard.
You are analyzing ${symbol}.

${buildStrategyContext(userProfile)}

═══════════════════════════════════════════
POSITION CONTEXT
═══════════════════════════════════════════
${positionContext}

${catalystContext.length > 0
  ? catalystContext.join('\n')
  : 'No known upcoming catalysts.'}

═══════════════════════════════════════════
SENTIMENT RELIABILITY FOR ${symbol}
═══════════════════════════════════════════
Reliability: ${sentReliability.reliability.toUpperCase()}
Reason: ${sentReliability.reason}
How to use: ${sentReliability.weight}

Sentiment score interpretation:
  Score > 0.65 (stored 0-1 scale) = broadly bullish
  Score < 0.35 = broadly bearish
  Score 0.35-0.65 = neutral/mixed
  High signalStrength + rising trend = more reliable
  Low agentConfidence = treat with skepticism
  NEVER use sentiment as sole basis for recommendation

${sentReliability.reliability === 'low'
  ? 'FOR THIS SYMBOL: Weight fundamentals and price ' +
    'trend significantly more than sentiment score.'
  : sentReliability.reliability === 'high'
  ? 'FOR THIS SYMBOL: Sentiment signal is meaningful. ' +
    'Combine with fundamentals for high-conviction calls.'
  : 'FOR THIS SYMBOL: Use sentiment as one factor among ' +
    'several. Require high signalStrength for conviction.'}

═══════════════════════════════════════════
MARKET ENVIRONMENT
═══════════════════════════════════════════
${vixLevel ? `VIX: ${vixLevel} — ` +
  (vixLevel > 30 ? 'HIGH volatility — elevated premiums, ' +
    'good for income strategies. Size conservatively.' :
   vixLevel > 20 ? 'MODERATE volatility — reasonable ' +
    'premium environment.' :
    'LOW volatility — compressed premiums. Income ' +
    'strategies yield less. Consider debit strategies.') :
  'VIX data unavailable.'}

${currentIV ? `${symbol} IV: ${currentIV}% implied volatility` :
  ''}

═══════════════════════════════════════════
STRATEGY GUIDES FOR YOUR ACTIVE STRATEGIES
═══════════════════════════════════════════
${applicableStrategies.length > 0
  ? strategyGuides
  : 'No active strategies configured. Provide general ' +
    'analysis and suggest user complete strategy profile ' +
    'in Settings for personalized guidance.'}

${expGapWarning}

═══════════════════════════════════════════
DATA INSTRUCTIONS
═══════════════════════════════════════════
You will receive compressed data: fundamentals, price
history summary, sentiment analysis, and recent news.
Use ONLY what is provided. Do not fabricate fields.
If a field is null or missing, acknowledge it and
reason from available data.

OUTPUT FORMAT:
A) Snapshot — current state in 2-3 sentences
B) Strategy recommendation — most applicable strategy
   for this symbol given user's profile, with specific
   strike/expiry/sizing if applicable
C) Sentiment assessment — how reliable is the signal
   for THIS symbol and what it suggests
D) Risk factors — what could go wrong
E) Action items — specific next steps (optional)`;
}

export function getMarketPrompt(userProfile = null) {
  const strategyCtx = buildStrategyContext(userProfile, null);

  return `You are AlphaBot, an AI trading assistant embedded in a personal trading dashboard.

${strategyCtx}

No specific symbol is in focus. Provide a market-wide assessment based on the
index snapshots, sector data, and watchlist sentiment provided.

SENTIMENT NOTE: Index ETFs (SPY, QQQ, IWM, VTI, SCHD) have LOW sentiment reliability —
social sentiment reflects price movement, does not predict it.
Do not cite sentiment scores for index ETFs as meaningful directional signals.

Tasks:
1) Assess overall market tone (risk-on vs risk-off)
2) Identify which sectors are showing strength or weakness
3) Relate conditions to the user's watchlist sentiment
4) Suggest positioning adjustments that align with the user's active strategies

Be concise — market overviews should be scannable, not exhaustive.

Output format:
A) Market tone — 1-2 sentences
B) Sector breakdown — what's strong / weak
C) Watchlist relevance — how market conditions affect tracked symbols
D) Positioning thoughts — any adjustments worth considering, matched to user's active strategies`;
}
