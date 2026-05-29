import { useState, useEffect } from 'react';
import { getUserProfile } from '../../services/userProfileApi';
import OnboardingModal from '../../components/OnboardingModal';

export default function Profile() {
  const [profile, setProfile]           = useState(undefined);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  async function handleComplete() {
    setShowOnboarding(false);
    // Reload from server — the analyze route already saved the profile
    try {
      const updated = await getUserProfile();
      setProfile(updated);
    } catch {
      // leave existing profile state intact
    }
  }

  const loading    = profile === undefined;
  const hasProfile = profile?.onboardingCompleted && !!profile?.strategyProfile?.claudeAnalysis;
  const sp         = profile?.strategyProfile;

  return (
    <>
      {showOnboarding && (
        <OnboardingModal
          onComplete={handleComplete}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      <section>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>Strategy Profile</h3>

        {loading && (
          <div style={skeletonStyle} />
        )}

        {/* Not completed — nudge */}
        {!loading && !hasProfile && (
          <div style={nudgeStyle}>
            <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 14 }}>⚡</div>
            <div>
              <p style={{ margin: '0 0 6px', fontWeight: 500, color: '#e5e7eb' }}>
                Complete your strategy profile
              </p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>
                Help AlphaBot personalize its recommendations, alerts, and analysis
                to your specific goals and risk tolerance.
              </p>
              <button style={btnPrimaryStyle} onClick={() => setShowOnboarding(true)}>
                Start setup →
              </button>
              {profile?.onboardingSkipped && (
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary, #6b7280)', margin: '6px 0 0' }}>
                  You skipped this earlier.
                  Your answers help AlphaBot personalize its recommendations.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Completed — summary */}
        {!loading && hasProfile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={completeBadgeStyle}>✓ Profile complete</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnTextStyle} onClick={() => setShowOnboarding(true)}>
                  Edit profile
                </button>
                <button style={btnSecondaryStyle} onClick={() => setShowOnboarding(true)}>
                  Retake questionnaire
                </button>
              </div>
            </div>

            <div style={cardStyle}>
              {(profile.activeStrategies?.length ?? sp?.recommendedStrategies?.length ?? 0) > 0 && (
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>Active strategies</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(profile.activeStrategies ?? sp?.recommendedStrategies).map(s => (
                      <span key={s} style={tagStyle}>{formatStrategyName(s)}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={rowStyle}>
                <span style={labelStyle}>Risk level</span>
                <span style={valueStyle}>{sp?.riskLevel || '—'}</span>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>Primary goal</span>
                <span style={valueStyle}>{sp?.primaryGoal || '—'}</span>
              </div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <span style={labelStyle}>Time horizon</span>
                <span style={valueStyle}>{sp?.timeHorizon || '—'}</span>
              </div>
            </div>

            {sp?.claudeAnalysis && (
              <div style={analysisStyle}>
                <p style={{ margin: 0, fontSize: 13, color: '#c7d2fe', lineHeight: 1.6 }}>
                  {sp.claudeAnalysis}
                </p>
              </div>
            )}

            {sp?.generatedAt && (
              <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
                Generated {new Date(sp.generatedAt).toLocaleDateString()}
              </p>
            )}

            <p style={{ fontSize: 11, color: 'var(--color-text-secondary, #6b7280)', margin: 0 }}>
              Your strategy profile was last updated on{' '}
              {profile.onboardingCompletedAt
                ? new Date(profile.onboardingCompletedAt).toLocaleDateString()
                : 'unknown date'}.
              Retake the questionnaire anytime to update your recommendations.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function formatStrategyName(id) {
  const names = {
    wheel_strategy:    'Wheel Strategy',
    covered_calls:     'Covered Calls',
    cash_secured_puts: 'Cash-Secured Puts',
    index_dca:         'Index Fund DCA',
    dividend_income:   'Dividend Income',
    growth_investing:  'Growth Investing',
    options_spreads:   'Options Spreads',
  };
  return names[id] || id;
}

const skeletonStyle = {
  height: 80,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  animation: 'pulse 1.5s ease-in-out infinite',
};

const nudgeStyle = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '20px 18px',
};

const completeBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#4ade80',
  background: 'rgba(74,222,128,0.1)',
  border: '1px solid rgba(74,222,128,0.25)',
  borderRadius: 20,
  padding: '4px 12px',
};

const btnPrimaryStyle = {
  background: 'rgba(99,102,241,0.2)',
  border: '1px solid rgba(99,102,241,0.45)',
  borderRadius: 8,
  color: '#a5b4fc',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 16px',
  cursor: 'pointer',
};

const btnTextStyle = {
  background: 'none',
  border: 'none',
  color: '#6b7280',
  fontSize: 13,
  cursor: 'pointer',
  padding: '4px 0',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(107,114,128,0.4)',
};

const btnSecondaryStyle = {
  background: 'rgba(99,102,241,0.15)',
  border: '1px solid rgba(99,102,241,0.4)',
  borderRadius: 8,
  color: '#a5b4fc',
  fontSize: 12,
  fontWeight: 500,
  padding: '5px 12px',
  cursor: 'pointer',
};

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '4px 0',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  gap: 12,
};

const labelStyle = {
  fontSize: 13,
  color: '#6b7280',
  minWidth: 130,
  flexShrink: 0,
};

const valueStyle = {
  fontSize: 13,
  color: '#d1d5db',
  textTransform: 'capitalize',
};

const analysisStyle = {
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  borderRadius: 10,
  padding: '14px 16px',
};

const tagStyle = {
  fontSize: 12,
  color: '#818cf8',
  background: 'rgba(99,102,241,0.15)',
  border: '1px solid rgba(99,102,241,0.3)',
  borderRadius: 6,
  padding: '2px 8px',
};
