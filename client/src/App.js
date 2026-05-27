import "./App.css";
import useAlpaca from "./hooks/useAlpaca";
import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";

import AssistantPanel from "./components/AssistantPanel";
import AssistantPage from "./pages/Assistant";
import SettingsLayout from "./pages/Settings/SettingsLayout";
import Profile from "./pages/Settings/Profile";
import BillingUsage from "./pages/Settings/BillingUsage";
import ApiKeys from "./pages/Settings/ApiKeys";
import Preferences from "./pages/Settings/Preferences";
import About from "./pages/Settings/About";
import Research from "./pages/Research";
import Dashboard from "./pages/Dashboard";
import Options from "./pages/Options";
import Portfolio from "./pages/Portfolio";
import SentimentPage from "./pages/SentimentPage";

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
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [activeSymbol, setActiveSymbol]     = useState(null);
  const [externalPrompt, setExternalPrompt] = useState(null);

  const handleTabClick = (tab) => {
    if (tab === 'settings') {
      setActiveTab('settings');
      navigate('/settings');
      return;
    }
    setActiveTab(tab);
    setActiveSymbol(null);
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

      <main className="main">
        {activeTab === 'overview' && (
          <Dashboard
            account={account}
            positions={positions}
            orders={orders}
            error={error}
            loading={loading}
            marketSnapshot={marketSnapshot}
            setMarketSnapshot={setMarketSnapshot}
            setActiveSymbol={setActiveSymbol}
            activeSymbol={activeSymbol}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'assistant' && (
          <AssistantPage
            account={account}
            positions={positions}
            orders={orders}
            marketSnapshot={marketSnapshot}
            activeSymbol={activeSymbol}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'research' && (
          <Research onNavigate={setActiveTab} setActiveSymbol={setActiveSymbol} refetchOrders={refetchOrders} />
        )}

        {activeTab === 'sentiment' && <SentimentPage />}

        {activeTab === 'options' && (
          <Options
            initialSymbol={activeSymbol}
            setActiveSymbol={setActiveSymbol}
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
          account={account}
          positions={positions}
          orders={orders}
          marketSnapshot={marketSnapshot}
          symbol={activeSymbol}
          externalPrompt={externalPrompt}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
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
          <Route path="preferences" element={<Preferences />} />
          <Route path="about"       element={<About />} />
        </Route>
        <Route path="*" element={<AppShell />} />
      </Routes>
    </Router>
  );
}
