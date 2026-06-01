import { useState, useEffect } from 'react';
import { getUserProfile, saveUserProfile } from '../../services/userProfileApi';
import OnboardingModal from '../../components/OnboardingModal';

const ALL_STRATEGIES = [
  // Income
  { id: 'wheel_strategy',    name: 'Wheel Strategy',      category: 'Income',  complexity: 'Intermediate' },
  { id: 'covered_calls',     name: 'Covered Calls',       category: 'Income',  complexity: 'Beginner' },
  { id: 'cash_secured_puts', name: 'Cash-Secured Puts',   category: 'Income',  complexity: 'Intermediate' },
  { id: 'iron_condor',       name: 'Iron Condor',         category: 'Income',  complexity: 'Advanced' },
  { id: 'bull_call_spread',  name: 'Bull Call Spread',    category: 'Income',  complexity: 'Intermediate' },
  { id: 'bear_put_spread',   name: 'Bear Put Spread',     category: 'Hedge',   complexity: 'Intermediate' },
  { id: 'options_spreads',   name: 'Options Spreads',     category: 'Income',  complexity: 'Advanced' },
  // Hedge
  { id: 'protective_put',    name: 'Protective Put',      category: 'Hedge',   complexity: 'Beginner' },
  { id: 'collar',            name: 'Collar',              category: 'Hedge',   complexity: 'Intermediate' },
  // Growth
  { id: 'leaps',             name: 'LEAPS',               category: 'Growth',  complexity: 'Intermediate' },
  { id: 'straddle_strangle', name: 'Straddle / Strangle', category: 'Growth',  complexity: 'Advanced' },
  { id: 'growth_investing',  name: 'Growth Investing',    category: 'Growth',  complexity: 'Intermediate' },
  // Passive
  { id: 'index_dca',         name: 'Index Fund DCA',      category: 'Passive', complexity: 'Beginner' },
  { id: 'dividend_income',   name: 'Dividend Income',     category: 'Passive', complexity: 'Beginner' },
];

const COMPLEXITY_STYLES = {
  Beginner:     'bg-green-100 text-green-800',
  Intermediate: 'bg-amber-100 text-amber-800',
  Advanced:     'bg-red-100 text-red-800',
};

const CATEGORIES = ['Income', 'Hedge', 'Growth', 'Passive'];

export default function Profile() {
  const [profile, setProfile]               = useState(undefined);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [formData, setFormData]             = useState({ activeStrategies: [] });
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState(null);

  useEffect(() => {
    getUserProfile()
      .then(p => {
        setProfile(p);
        setFormData({
          activeStrategies: p?.activeStrategies ?? p?.strategyProfile?.recommendedStrategies ?? [],
        });
      })
      .catch(() => setProfile(null));
  }, []);

  function handleStrategyToggle(id) {
    setFormData(prev => {
      const current = prev.activeStrategies || [];
      const next = current.includes(id)
        ? current.filter(s => s !== id)
        : [...current, id];
      return { ...prev, activeStrategies: next };
    });
    setSaveMsg(null);
  }

  async function handleSaveStrategies() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveUserProfile({ activeStrategies: formData.activeStrategies });
      setSaveMsg('Saved');
    } catch {
      setSaveMsg('Save failed — please try again');
    } finally {
      setSaving(false);
    }
  }

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
              <div style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={labelStyle}>Active strategies</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {saveMsg && (
                      <span style={{ fontSize: 12, color: saveMsg === 'Saved' ? '#4ade80' : '#f87171' }}>
                        {saveMsg}
                      </span>
                    )}
                    <button
                      style={btnSecondaryStyle}
                      onClick={handleSaveStrategies}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save strategies'}
                    </button>
                  </div>
                </div>

                {CATEGORIES.map(category => (
                  <div key={category} style={{ width: '100%' }}>
                    <h4 style={categoryHeadingStyle}>{category}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ALL_STRATEGIES.filter(s => s.category === category).map(strategy => (
                        <label key={strategy.id} style={strategyRowStyle}>
                          <input
                            type="checkbox"
                            checked={formData.activeStrategies?.includes(strategy.id) || false}
                            onChange={() => handleStrategyToggle(strategy.id)}
                            style={{ marginRight: 0, flexShrink: 0, cursor: 'pointer' }}
                          />
                          <span style={{ flex: 1, fontSize: 13, color: '#d1d5db' }}>{strategy.name}</span>
                          <span style={complexityBadgeStyle(strategy.complexity)}>
                            {strategy.complexity}
                          </span>
                          {strategy.complexity === 'Advanced' && (
                            <span style={{ fontSize: 11, color: '#f87171', fontStyle: 'italic' }}>
                              Requires advanced options experience
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

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
  const s = ALL_STRATEGIES.find(x => x.id === id);
  return s ? s.name : id;
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

const categoryHeadingStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 8px',
};

const strategyRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
};

function complexityBadgeStyle(complexity) {
  const colors = {
    Beginner:     { color: '#166534', background: '#dcfce7' },
    Intermediate: { color: '#92400e', background: '#fef3c7' },
    Advanced:     { color: '#991b1b', background: '#fee2e2' },
  };
  const c = colors[complexity] || {};
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: '1px 8px',
    borderRadius: 9999,
    ...c,
  };
}
