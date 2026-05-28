import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import {
  getUserProfile,
  saveUserProfile,
  markOnboardingSkipped,
  markOnboardingCompleted,
} from '../services/userProfileDb.js';

const router = express.Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/user/profile
router.get('/', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const profile = await getUserProfile(userId, tenantId);
    res.json({ profile });
  } catch (err) {
    console.error('[userProfile] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// POST /api/user/profile/skip
router.post('/skip', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    await markOnboardingSkipped(userId, tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[userProfile] skip error:', err.message);
    res.status(500).json({ error: 'Failed to record skip' });
  }
});

// POST /api/user/profile/analyze
// Body: { questionnaire: { portfolioSize, primaryGoal, timeHorizon, riskTolerance, timeCommitment, accountType, optionsExperience } }
router.post('/analyze', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { questionnaire } = req.body;

    if (!questionnaire) {
      return res.status(400).json({ error: 'questionnaire is required' });
    }

    const analysisPrompt = buildAnalysisPrompt(questionnaire);

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const rawText = message.content?.[0]?.text || '';
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || rawText);
    } catch {
      parsed = { claudeAnalysis: rawText, recommendedStrategies: [], riskLevel: null };
    }

    const strategyProfile = {
      recommendedStrategies: Array.isArray(parsed.recommendedStrategies)
        ? parsed.recommendedStrategies
        : [],
      riskLevel:      parsed.riskLevel      || null,
      primaryGoal:    parsed.primaryGoal    || null,
      timeHorizon:    parsed.timeHorizon    || null,
      claudeAnalysis: parsed.claudeAnalysis || rawText,
      generatedAt:    new Date().toISOString(),
    };

    const profileData = {
      onboardingCompleted:   true,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingSkipped:     false,
      questionnaire,
      strategyProfile,
      activeStrategies: strategyProfile.recommendedStrategies.slice(0, 3),
    };

    await saveUserProfile(userId, tenantId, profileData);
    await markOnboardingCompleted(userId, tenantId);

    res.json({ profile: { userId, tenantId, ...profileData } });
  } catch (err) {
    console.error('[userProfile] analyze error:', err.message);
    res.status(500).json({ error: 'Failed to analyze profile' });
  }
});

// PUT /api/user/profile
// Allows direct profile saves (e.g., from Settings page relaunch)
router.put('/', async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const profileData = req.body;
    await saveUserProfile(userId, tenantId, profileData);
    res.json({ ok: true });
  } catch (err) {
    console.error('[userProfile] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

function buildAnalysisPrompt(q) {
  return `You are AlphaBot's onboarding analyst. A user has completed their investment profile questionnaire.
Analyze their answers and return a JSON strategy profile.

User answers:
- Portfolio size: ${q.portfolioSize}
- Primary goal: ${q.primaryGoal}
- Time horizon: ${q.timeHorizon}
- Risk tolerance: ${q.riskTolerance}
- Time commitment: ${q.timeCommitment}
- Account type: ${q.accountType}
- Options experience: ${q.optionsExperience}

Return ONLY valid JSON in this exact shape (no markdown, no explanation outside the JSON):
{
  "recommendedStrategies": ["strategy1", "strategy2", "strategy3"],
  "riskLevel": "conservative|moderate|aggressive|speculative",
  "primaryGoal": "one-sentence summary of their primary goal",
  "timeHorizon": "one-sentence summary of their time horizon",
  "claudeAnalysis": "2-3 sentence personalized analysis and guidance for this user"
}

Strategy options to choose from (pick 2-4 most suitable):
"Buy and Hold", "Dividend Income", "Growth Investing", "Value Investing",
"Swing Trading", "Day Trading", "Options Covered Calls", "Options Spreads",
"ETF Rotation", "Momentum Trading", "Defensive/Capital Preservation"`;
}

export default router;
