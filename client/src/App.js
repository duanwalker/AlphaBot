import "./App.css";
import useAlpaca from "./hooks/useAlpaca";
import { useState } from "react";

import AssistantPanel from "./components/AssistantPanel";
import SettingsLayout from "./pages/Settings/SettingsLayout";
import Profile from "./pages/Settings/Profile";
import BillingUsage from "./pages/Settings/BillingUsage";
import ApiKeys from "./pages/Settings/ApiKeys";
import Preferences from "./pages/Settings/Preferences";
import About from "./pages/Settings/About";
import Research from "./pages/Research";
import Dashboard from "./pages/Dashboard";

import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

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
  const { account, positions, orders, loading, error } = useAlpaca();
  const [activeTab, setActiveTab]       = useState(initialTab);
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [activeSymbol, setActiveSymbol] = useState(null);

  const handleTabClick = (tab) => setActiveTab(tab);

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

          <Link className="tab-settings-link" to="/settings" aria-label="Settings">
            Settings
          </Link>
        </div>

        <div className="nav-right">
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
          <AssistantPanel
            inline
            open
            account={account}
            positions={positions}
            orders={orders}
            marketSnapshot={marketSnapshot}
            symbol={activeSymbol}
          />
        )}

        {activeTab === 'research' && <Research />}

        {activeTab === 'sentiment' && (
          <div className="tab-placeholder">
            <p>Sentiment — coming soon.</p>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="tab-placeholder">
            <p>Options — coming soon.</p>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="tab-placeholder">
            <p>Portfolio — coming soon.</p>
          </div>
        )}
      </main>

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
        <Route path="/settings" element={<SettingsLayout />}>
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
