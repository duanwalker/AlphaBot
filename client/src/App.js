import "./App.css";
import useAlpaca from "./hooks/useAlpaca";
import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { getUserProfile } from "./services/userProfileApi";
import OnboardingModal from "./components/OnboardingModal";

import AssistantPanel from "./components/AssistantPanel";
import AssistantPage from "./pages/Assistant";
import SettingsLayout from "./pages/Settings/SettingsLayout";
import Profile from "./pages/Settings/Profile";
import BillingUsage from "./pages/Settings/BillingUsage";
import ApiKeys from "./pages/Settings/ApiKeys";
import Preferences from "./pages/Settings/Preferences";
import TradingAccount from "./pages/Settings/TradingAccount";
import About from "./pages/Settings/About";
import Research from "./pages/Research";
import Dashboard from "./pages/Dashboard";
import Options from "./pages/Options";
import Portfolio from "./pages/Portfolio";
import SentimentPage from "./pages/SentimentPage";
import { SymbolProvider } from "./context/SymbolContext";

const TABS = ['overview', 'assistant', 'research', 'sentiment', 'options', 'portfolio'];

const TAB_LABELS = {
  overview:  'Overview',
  assistant: 'Assistant',
  research:  'Research',
  sentiment: 'Sentiment',
  options:   'Options',
  portfolio: 'Portfolio',
};

function AppShell({ initialTab = 'overview' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { account, positions, orders, loading, error, refetchOrders } = useAlpaca();
  const [activeTab, setActiveTab]           = useState(location.state?.tab || initialTab);
  const [showAssistant, setShowAssistant]   = useState(false);
  const [panelWidth, setPanelWidth]         = useState(400);
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [externalPrompt, setExternalPrompt] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userProfile, setUserProfile]       = useState(null);

  useEffect(() => {
    if (showOnboarding) {
      setShowAssistant(false);
    }
  }, [showOnboarding]);

  useEffect(() => {
    getUserProfile()
      .then((profile) => {
        setUserProfile(profile);
        const shouldShow = !profile ||
          (!profile.onboardingCompleted &&
           !profile.onboardingSkipped);
        setShowOnboarding(shouldShow);
      })
      .catch(() => {
        console.warn('[PROFILE] Profile fetch failed — skipping onboarding check');
        setShowOnboarding(false);
        setProfileLoading(false);
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, []);

  function handleOnboardingComplete(analysis) {
    setShowOnboarding(false);
    setUserProfile(prev => ({
      ...prev,
      onboardingCompleted: true,
      onboardingSkipped: false,
      strategyProfile: analysis,
    }));
  }

  function handleOnboardingSkip() {
    setShowOnboarding(false);
    setUserProfile(prev => ({
      ...prev,
      onboardingSkipped: true,
    }));
  }

  const handleTabClick = (tab) => {
    if (tab === 'settings') {
      setActiveTab('settings');
      navigate('/settings');
      return;
    }
    setActiveTab(tab);
    if (tab === 'assistant') setShowAssistant(false);
    if (tab === 'portfolio') refetchOrders();
    // When leaving /settings, navigate back to root and pass the desired tab
    if (location.pathname.startsWith('/settings')) {
      navigate('/', { state: { tab } });
    }
  };

  return (
    <div className="app-root">
      <nav className="topnav">
        <div className="nav-left">
          <div className="logo">AlphaBot</div>
        </div>

        <div className="tab-nav" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}

          <div className="tab-settings-sep">
            <button
              role="tab"
              aria-selected={activeTab === 'settings'}
              className={`tab-btn tab-settings-btn${activeTab === 'settings' ? ' active' : ''}`}
              onClick={() => handleTabClick('settings')}
              title="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="nav-right">
          {activeTab !== 'assistant' && (
            <button
              className="ai-trigger-btn"
              onClick={() => setShowAssistant(true)}
              title="Ask AlphaBot"
            >
              ✦ AI
            </button>
          )}
          <div className="user-pill">duan</div>
        </div>
      </nav>

      <div className="content-row">
        <main className={`main${showAssistant ? ' main-with-panel' : ''}`}>
          {activeTab === 'overview' && (
            <Dashboard
              account={account}
              positions={positions}
              orders={orders}
              error={error}
              loading={loading}
              marketSnapshot={marketSnapshot}
              setMarketSnapshot={setMarketSnapshot}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'assistant' && (
            <AssistantPage
              account={account}
              positions={positions}
              orders={orders}
              marketSnapshot={marketSnapshot}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'research' && (
            <Research onNavigate={setActiveTab} refetchOrders={refetchOrders} />
          )}

          {activeTab === 'sentiment' && <SentimentPage />}

          {activeTab === 'options' && (
            <Options
              setShowAssistant={setShowAssistant}
              setExternalPrompt={setExternalPrompt}
            />
          )}

          {activeTab === 'portfolio' && (
            <Portfolio
              account={account}
              positions={positions}
              orders={orders}
              loading={loading}
              error={error}
              setActiveTab={setActiveTab}
            />
          )}

          {/* Settings renders via SettingsLayout's <Outlet> — populated by the Route children below */}
          {activeTab === 'settings' && <SettingsLayout />}
        </main>

        {activeTab !== 'assistant' && (
          <AssistantPanel
            open={showAssistant}
            onClose={() => setShowAssistant(false)}
            panelWidth={panelWidth}
            setPanelWidth={setPanelWidth}
            account={account}
            positions={positions}
            orders={orders}
            marketSnapshot={marketSnapshot}
            externalPrompt={externalPrompt}
          />
        )}
      </div>

      {!profileLoading && showOnboarding && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <SymbolProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AppShell initialTab="overview" />} />
          <Route path="/research" element={<AppShell initialTab="research" />} />
          <Route path="/orders" element={<AppShell initialTab="portfolio" />} />
          <Route path="/positions" element={<AppShell initialTab="portfolio" />} />
          <Route path="/settings" element={<AppShell initialTab="settings" />}>
            <Route index          element={<Profile />} />
            <Route path="profile"     element={<Profile />} />
            <Route path="billing"     element={<BillingUsage />} />
            <Route path="api-keys"    element={<ApiKeys />} />
            <Route path="preferences"     element={<Preferences />} />
            <Route path="trading-account" element={<TradingAccount />} />
            <Route path="about"           element={<About />} />
          </Route>
          <Route path="*" element={<AppShell />} />
        </Routes>
      </Router>
    </SymbolProvider>
  );
}
