import { useState } from 'react';
import './OnboardingModal.css';

const QUESTIONS = [
  {
    id: 'portfolioSize',
    screen: 2,
    title: 'What is your approximate portfolio size?',
    subtitle: 'This helps AlphaBot suggest appropriate position sizes.',
    options: [
      { value: 'under_10k',    label: 'Under $10,000' },
      { value: '10k_50k',      label: '$10,000 – $50,000' },
      { value: '50k_250k',     label: '$50,000 – $250,000' },
      { value: 'over_250k',    label: 'Over $250,000' },
    ]
  },
  {
    id: 'primaryGoal',
    screen: 3,
    title: 'What matters most to you?',
    subtitle: 'AlphaBot will prioritize opportunities that match your goal.',
    options: [
      { value: 'income_now',   label: 'Generate income now (monthly cash flow)' },
      { value: 'growth',       label: 'Grow wealth long term (5–20 year horizon)' },
      { value: 'balanced',     label: 'Both — balanced approach' },
      { value: 'preserve',     label: 'Preserve capital (low risk)' },
    ]
  },
  {
    id: 'timeHorizon',
    screen: 4,
    title: 'When might you need this money?',
    subtitle: 'Your time horizon shapes which strategies make sense.',
    options: [
      { value: 'under_2y',     label: 'Within 2 years' },
      { value: '2_5y',         label: '2 – 5 years' },
      { value: '5_15y',        label: '5 – 15 years' },
      { value: 'over_15y',     label: '15+ years (retirement)' },
    ]
  },
  {
    id: 'riskTolerance',
    screen: 5,
    title: 'How would you react if your portfolio dropped 20% in one month?',
    subtitle: 'Be honest — AlphaBot will use this to calibrate risk.',
    options: [
      { value: 'sell',         label: 'Sell everything immediately' },
      { value: 'hold_worried', label: 'Feel sick but hold' },
      { value: 'hold_wait',    label: 'Hold and wait for recovery' },
      { value: 'buy_more',     label: 'Buy more — great opportunity' },
    ]
  },
  {
    id: 'timeCommitment',
    screen: 6,
    title: 'How much time can you spend managing investments per week?',
    subtitle: 'Some strategies require more active monitoring than others.',
    options: [
      { value: 'under_1h',     label: 'Less than 1 hour (fully passive)' },
      { value: '1_3h',         label: '1 – 3 hours (mostly passive)' },
      { value: '3_7h',         label: '3 – 7 hours (semi-active)' },
      { value: 'daily',        label: 'Daily (active trader)' },
    ]
  },
  {
    id: 'accountType',
    screen: 7,
    title: 'What type of account are you using?',
    subtitle: 'Tax treatment affects which strategies are most efficient.',
    options: [
      { value: 'taxable',         label: 'Taxable brokerage' },
      { value: 'traditional_ira', label: 'Traditional IRA' },
      { value: 'roth_ira',        label: 'Roth IRA' },
      { value: 'multiple',        label: 'Multiple account types' },
    ]
  },
  {
    id: 'optionsExperience',
    screen: 8,
    title: 'What is your options trading experience?',
    subtitle: 'AlphaBot adjusts the complexity of its recommendations.',
    options: [
      { value: 'none',       label: 'Never traded options' },
      { value: 'bought',     label: 'Bought calls or puts before' },
      { value: 'sold_calls', label: 'Sold covered calls' },
      { value: 'advanced',   label: 'Full wheel strategy or spreads' },
    ]
  },
];

const TOTAL_SCREENS = 10; // welcome + 7 questions + analyzing + results

export default function OnboardingModal({ onComplete, onSkip }) {
  const [screen, setScreen]                   = useState(1);
  const [answers, setAnswers]                 = useState({});
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [analyzing, setAnalyzing]             = useState(false);
  const [analysis, setAnalysis]               = useState(null);
  const [error, setError]                     = useState(null);

  const currentQuestion = QUESTIONS.find(q => q.screen === screen);
  const progress = Math.round((screen / TOTAL_SCREENS) * 100);

  function handleAnswer(questionId, value) {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    setTimeout(() => setScreen(s => s + 1), 300);
  }

  async function handleAnalyze() {
    setScreen(9);
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/profile/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionnaire: answers }),
      });

      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      setAnalysis(data.analysis);
      setScreen(10);
    } catch (err) {
      setError('Unable to generate analysis. Please try again.');
      setScreen(8);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleComplete() {
    try {
      await fetch('/api/profile/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaire: answers,
          strategyProfile: analysis,
          activeStrategies: analysis?.recommendedStrategies || [],
        }),
      });
      onComplete(analysis);
    } catch (err) {
      setError('Failed to save profile. Please try again.');
    }
  }

  async function handleSkipConfirmed() {
    await fetch('/api/profile/skip', { method: 'POST' });
    onSkip();
  }

  // Trigger analysis when the analyzing screen is first reached
  if (screen === 9 && !analyzing && !analysis) {
    handleAnalyze();
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">

        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">AlphaBot</div>
          {!showSkipConfirm && screen < 9 && (
            <button
              className="onboarding-x"
              onClick={() => setShowSkipConfirm(true)}
              aria-label="Close onboarding"
            >
              ✕
            </button>
          )}
        </div>

        {/* Progress bar */}
        {screen > 1 && screen < 9 && (
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Skip confirmation */}
        {showSkipConfirm && (
          <div className="onboarding-skip-confirm">
            <h3>Are you sure you want to skip setup?</h3>
            <p>
              AlphaBot uses your strategy profile to give personalized
              recommendations. Without it you'll receive general advice.
            </p>
            <p className="onboarding-skip-note">
              You can complete this anytime in Settings → Profile.
            </p>
            <div className="onboarding-skip-actions">
              <button className="btn-secondary" onClick={handleSkipConfirmed}>
                Complete later
              </button>
              <button className="btn-primary" onClick={() => setShowSkipConfirm(false)}>
                Stay and finish
              </button>
            </div>
          </div>
        )}

        {/* Screen 1: Welcome */}
        {!showSkipConfirm && screen === 1 && (
          <div className="onboarding-screen">
            <div className="onboarding-welcome-icon">⚡</div>
            <h2>Welcome to AlphaBot</h2>
            <p>
              Let's set up your personalized strategy profile.
              AlphaBot will use your answers to tailor its
              recommendations, alerts, and analysis to your
              specific goals and risk tolerance.
            </p>
            <p className="onboarding-time-note">Takes about 2 minutes.</p>
            <button
              className="btn-primary onboarding-cta"
              onClick={() => setScreen(2)}
            >
              Get started →
            </button>
          </div>
        )}

        {/* Screens 2–8: Questions */}
        {!showSkipConfirm && currentQuestion && (
          <div className="onboarding-screen">
            <div className="onboarding-step">
              Question {screen - 1} of {QUESTIONS.length}
            </div>
            <h2>{currentQuestion.title}</h2>
            <p className="onboarding-subtitle">{currentQuestion.subtitle}</p>
            <div className="onboarding-options">
              {currentQuestion.options.map(opt => (
                <button
                  key={opt.value}
                  className={`onboarding-option${answers[currentQuestion.id] === opt.value ? ' selected' : ''}`}
                  onClick={() => handleAnswer(currentQuestion.id, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {error && <p className="onboarding-error">{error}</p>}
          </div>
        )}

        {/* Screen 9: Analyzing */}
        {!showSkipConfirm && screen === 9 && (
          <div className="onboarding-screen onboarding-analyzing">
            <div className="onboarding-spinner" />
            <h2>Analyzing your profile…</h2>
            <p>
              AlphaBot is reviewing your answers and selecting
              the strategies that best match your goals.
            </p>
          </div>
        )}

        {/* Screen 10: Results */}
        {!showSkipConfirm && screen === 10 && analysis && (
          <div className="onboarding-screen">
            <div className="onboarding-success-icon">✓</div>
            <h2>Your personalized strategy</h2>

            <div className="onboarding-strategy-cards">
              {analysis.recommendedStrategies?.map(strategy => (
                <div key={strategy} className="onboarding-strategy-card">
                  {formatStrategyName(strategy)}
                </div>
              ))}
            </div>

            <div className="onboarding-analysis">
              <p>{analysis.claudeAnalysis}</p>
            </div>

            {analysis.warningFlags?.length > 0 && (
              <div className="onboarding-warnings">
                {analysis.warningFlags.map((flag, i) => (
                  <p key={i} className="onboarding-warning">⚠ {flag}</p>
                ))}
              </div>
            )}

            <div className="onboarding-results-actions">
              <button className="btn-primary onboarding-cta" onClick={handleComplete}>
                Start using AlphaBot →
              </button>
              <button className="btn-text" onClick={() => setScreen(2)}>
                Retake questionnaire
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function formatStrategyName(id) {
  const names = {
    wheel_strategy:    '⚙ Wheel Strategy',
    covered_calls:     '📈 Covered Calls',
    cash_secured_puts: '🎯 Cash-Secured Puts',
    index_dca:         '📊 Index Fund DCA',
    dividend_income:   '💰 Dividend Income',
    growth_investing:  '🚀 Growth Investing',
    options_spreads:   '⚖ Options Spreads',
  };
  return names[id] || id;
}
