// src/App.js
import React, { useState } from "react";
import Portfolio from "./components/Portfolio";
import Signals from "./components/Signals";
import Research from "./components/Research";
import Trades from "./components/Trades";
import Settings from "./components/Settings";
import { TradingModeProvider, useTradingMode } from "./context/TradingModeContext";
import "./App.css";

const TABS = [
  { id: "portfolio", label: "Portfolio" },
  { id: "signals", label: "AI Signals" },
  { id: "research", label: "Research" },
  { id: "trades", label: "Pending Trades" },
  { id: "settings", label: "Settings" },
];

function AppInner() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [trades, setTrades] = useState([]);
  const { tradingMode } = useTradingMode();

  function addTrade(trade) {
    setTrades((prev) => [...prev, trade]);
    setActiveTab("trades");
  }

  const pendingCount = trades.filter((t) => t.status === "pending").length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">AlphaBot</span>
          <span className="status-dot" />
          <span className="status-label">
            Semi-automated · {tradingMode === "live" ? "Live trading" : "Paper trading"}
          </span>
        </div>
        <div className="topbar-right">
          <span className="topbar-badge" onClick={() => setActiveTab("settings")}>⚙ Settings</span>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === "trades" && pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="main">
        {activeTab === "portfolio" && <Portfolio />}
        {activeTab === "signals" && <Signals onAddTrade={addTrade} />}
        {activeTab === "research" && <Research />}
        {activeTab === "trades" && <Trades trades={trades} setTrades={setTrades} />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <TradingModeProvider>
      <AppInner />
    </TradingModeProvider>
  );
}
