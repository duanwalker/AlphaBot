import { useState, useEffect } from 'react';
import { getUserProfile } from '../../services/userProfileApi';
import OnboardingModal from '../../components/OnboardingModal';

const RISK_COLORS = {
  conservative:    '#4ade80',
  moderate:        '#60a5fa',
  aggressive:      '#f59e0b',
  speculative:     '#f87171',
  very_aggressive: '#f87171',
};

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || '#9ca3af';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
      textTransform: 'capitalize',
    }}>
      {level?.replace(/_/g, ' ') || 'unknown'}
    </span>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(undefined);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  function handleComplete(newProfile) {
    setShowModal(false);
    setProfile(newProfile);
  }

  if (profile === undefined) {
    return (
      <section>
        <h3>User Profile</h3>
        <p className="settings-copy" style={{ color: '#6b7280' }}>Loading...</p>
      </section>
    );
  }

  const sp = profile?.strategyProfile;
  const q  = profile?.questionnaire;
  const hasProfile = sp?.claudeAnalysis;

  return (
    <>
      {showModal && (
        <OnboardingModal
          onComplete={handleComplete}
          onSkip={() => setShowModal(false)}
        />
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Strategy Profile</h3>
          <button
            onClick={() => setShowModal(true)}
            style={btnStyle}
          >
            {hasProfile ? 'Retake Questionnaire' : 'Set Up Profile'}
          </button>
        </div>

        {!hasProfile ? (
          <div style={emptyStyle}>
            <p style={{ margin: '0 0 6px', fontWeight: 500, color: '#e5e7eb' }}>
              No strategy profile yet
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
              Complete the questionnaire and AlphaBot will personalize all recommendations to your goals and risk tolerance.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <div style={rowStyle}>
                <span style={labelStyle}>Risk Level</span>
                <RiskBadge level={sp.riskLevel} />
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>Primary Goal</span>
                <span style={valueStyle}>{sp.primaryGoal || '—'}</span>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>Time Horizon</span>
                <span style={valueStyle}>{sp.timeHorizon || '—'}</span>
              </div>
              {Array.isArray(sp.recommendedStrategies) && sp.recommendedStrategies.length > 0 && (
                <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                  <span style={labelStyle}>Strategies</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {sp.recommendedStrategies.map((s) => (
                      <span key={s} style={tagStyle}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {sp.claudeAnalysis && (
              <div style={analysisStyle}>
                <p style={{ margin: 0, fontSize: 13, color: '#c7d2fe', lineHeight: 1.6 }}>
                  {sp.claudeAnalysis}
                </p>
              </div>
            )}

            {q && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', userSelect: 'none' }}>
                  View questionnaire answers
                </summary>
                <div style={{ ...cardStyle, marginTop: 10 }}>
                  {Object.entries(q)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} style={rowStyle}>
                        <span style={labelStyle}>{formatKey(k)}</span>
                        <span style={valueStyle}>{String(v).replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                </div>
              </details>
            )}

            {sp.generatedAt && (
              <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>
                Generated {new Date(sp.generatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function formatKey(k) {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const btnStyle = {
  background: 'rgba(99,102,241,0.15)',
  border: '1px solid rgba(99,102,241,0.4)',
  borderRadius: 8,
  color: '#a5b4fc',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 16px',
  cursor: 'pointer',
};

const emptyStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '20px 18px',
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
