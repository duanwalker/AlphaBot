import { useState } from 'react';
import { analyzeProfile, skipOnboarding } from '../services/userProfileApi';

const STEPS = [
  {
    key: 'portfolioSize',
    title: 'How large is your portfolio?',
    options: [
      { value: 'under_10k',   label: 'Under $10K' },
      { value: '10k_50k',     label: '$10K – $50K' },
      { value: '50k_250k',    label: '$50K – $250K' },
      { value: 'over_250k',   label: 'Over $250K' },
    ],
  },
  {
    key: 'primaryGoal',
    title: 'What is your primary investment goal?',
    options: [
      { value: 'capital_growth',  label: 'Capital Growth' },
      { value: 'income_dividends', label: 'Income / Dividends' },
      { value: 'preservation',    label: 'Capital Preservation' },
      { value: 'speculation',     label: 'Speculation / High Risk' },
    ],
  },
  {
    key: 'timeHorizon',
    title: 'What is your typical trade time horizon?',
    options: [
      { value: 'days',   label: 'Days (swing trading)' },
      { value: 'weeks',  label: 'Weeks' },
      { value: 'months', label: 'Months' },
      { value: 'years',  label: 'Years (long-term)' },
    ],
  },
  {
    key: 'riskTolerance',
    title: 'How would you describe your risk tolerance?',
    options: [
      { value: 'conservative',    label: 'Conservative — protect capital first' },
      { value: 'moderate',        label: 'Moderate — balanced growth' },
      { value: 'aggressive',      label: 'Aggressive — maximize returns' },
      { value: 'very_aggressive', label: 'Very Aggressive — high risk / high reward' },
    ],
  },
  {
    key: 'timeCommitment',
    title: 'How much time can you dedicate to trading?',
    options: [
      { value: 'minimal',   label: 'Minimal — set and forget' },
      { value: 'part_time', label: 'Part-time — a few hours/week' },
      { value: 'active',    label: 'Active — daily check-ins' },
      { value: 'full_time', label: 'Full-time — markets are my job' },
    ],
  },
  {
    key: 'accountType',
    title: 'What type of account do you primarily trade in?',
    options: [
      { value: 'cash',   label: 'Cash account' },
      { value: 'margin', label: 'Margin account' },
      { value: 'ira',    label: 'IRA / retirement account' },
      { value: 'paper',  label: 'Paper trading (practice)' },
    ],
  },
  {
    key: 'optionsExperience',
    title: 'What is your experience with options?',
    options: [
      { value: 'none',         label: 'None — I don\'t trade options' },
      { value: 'basic',        label: 'Basic — buying calls/puts' },
      { value: 'intermediate', label: 'Intermediate — spreads, covered calls' },
      { value: 'advanced',     label: 'Advanced — complex strategies' },
    ],
  },
];

export default function OnboardingModal({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step) / STEPS.length) * 100;

  function handleSelect(value) {
    setAnswers((prev) => ({ ...prev, [currentStep.key]: value }));
  }

  async function handleNext() {
    if (!answers[currentStep.key]) return;

    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const profile = await analyzeProfile(answers);
      onComplete(profile);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    try {
      await skipOnboarding();
    } catch {
      // best-effort
    }
    onSkip();
  }

  const selected = answers[currentStep.key];

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <span style={styles.logo}>AlphaBot</span>
            <span style={styles.badge}>Setup</span>
          </div>
          <p style={styles.subtitle}>
            Let's personalize your experience — takes about 2 minutes.
          </p>
        </div>

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
        <p style={styles.stepCount}>{step + 1} of {STEPS.length}</p>

        <div style={styles.body}>
          <h2 style={styles.question}>{currentStep.title}</h2>

          <div style={styles.options}>
            {currentStep.options.map((opt) => (
              <button
                key={opt.value}
                style={{
                  ...styles.option,
                  ...(selected === opt.value ? styles.optionSelected : {}),
                }}
                onClick={() => handleSelect(opt.value)}
              >
                {selected === opt.value && <span style={styles.check}>✓ </span>}
                {opt.label}
              </button>
            ))}
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.footer}>
          <button style={styles.skipBtn} onClick={handleSkip} disabled={loading}>
            Skip for now
          </button>

          <div style={styles.navBtns}>
            {step > 0 && (
              <button
                style={styles.backBtn}
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
              >
                Back
              </button>
            )}
            <button
              style={{
                ...styles.nextBtn,
                opacity: selected ? 1 : 0.4,
              }}
              onClick={handleNext}
              disabled={!selected || loading}
            >
              {loading
                ? 'Analyzing...'
                : isLast
                  ? 'Generate My Profile'
                  : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    margin: '0 16px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '28px 28px 16px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#e5e7eb',
    letterSpacing: '-0.02em',
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    background: 'rgba(99,102,241,0.2)',
    color: '#818cf8',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: 6,
    padding: '2px 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    margin: 0,
  },
  progressBar: {
    height: 3,
    background: 'rgba(255,255,255,0.08)',
    margin: '0 28px',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#6366f1',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  stepCount: {
    fontSize: 12,
    color: '#6b7280',
    margin: '6px 28px 0',
    textAlign: 'right',
  },
  body: {
    padding: '24px 28px',
    flexGrow: 1,
  },
  question: {
    fontSize: 17,
    fontWeight: 600,
    color: '#e5e7eb',
    margin: '0 0 18px',
    lineHeight: 1.4,
  },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  option: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 14,
    color: '#d1d5db',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  optionSelected: {
    background: 'rgba(99,102,241,0.15)',
    borderColor: 'rgba(99,102,241,0.55)',
    color: '#a5b4fc',
    fontWeight: 500,
  },
  check: {
    color: '#6366f1',
    fontWeight: 700,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    marginTop: 12,
  },
  footer: {
    padding: '16px 28px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(255,255,255,0.07)',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    cursor: 'pointer',
    padding: '8px 0',
  },
  navBtns: {
    display: 'flex',
    gap: 10,
  },
  backBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 500,
    padding: '10px 20px',
    cursor: 'pointer',
  },
  nextBtn: {
    background: '#6366f1',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 22px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
