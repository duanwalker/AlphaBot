// src/components/Portfolio.js
import React, { useState, useEffect } from "react";
import { alpaca, oanda, aiChat } from "../services/api";
import { useTradingMode } from "../context/TradingModeContext";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// Fallback demo data shown when broker APIs are not yet configured
const DEMO_POSITIONS = [
  { symbol: "AAPL", qty: 20, current_price: 189.3, cost_basis: 172.4, market_value: 3786, unrealized_pl: 338, asset_class: "us_equity" },
  { symbol: "MSFT", qty: 10, current_price: 415.2, cost_basis: 352.1, market_value: 4152, unrealized_pl: 631, asset_class: "us_equity" },
  { symbol: "NVDA", qty: 5, current_price: 880.0, cost_basis: 612.0, market_value: 4400, unrealized_pl: 1340, asset_class: "us_equity" },
  { symbol: "EUR/USD", qty: 10000, current_price: 1.0858, cost_basis: 1.0892, market_value: 10858, unrealized_pl: -34, asset_class: "forex" },
  { symbol: "GBP/JPY", qty: 5000, current_price: 191.2, cost_basis: 192.8, market_value: 9560, unrealized_pl: -80, asset_class: "forex" },
];

const DEMO_EQUITY_CURVE = [
  { date: "Jan", value: 40000 }, { date: "Feb", value: 41200 },
  { date: "Mar", value: 39800 }, { date: "Apr", value: 43100 },
  { date: "May", value: 44500 }, { date: "Jun", value: 46200 },
  { date: "Jul", value: 45100 }, { date: "Aug", value: 47800 },
  { date: "Sep", value: 48230 },
];

export default function Portfolio() {
  const [positions, setPositions] = useState([]);
  const [account, setAccount] = useState(null);
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const { tradingMode } = useTradingMode();

  useEffect(() => {
    loadData();
  }, [tradingMode]);

  async function loadData() {
    setLoading(true);
    try {
      const [acct, pos] = await Promise.all([
        alpaca.getAccount(),
        alpaca.getPositions(),
      ]);
      setAccount(acct);
      setPositions(pos);
    } catch {
      setUsingDemo(true);
      setPositions(DEMO_POSITIONS);
      setAccount({ portfolio_value: 48230, cash: 12000, buying_power: 24000, daytrade_count: 2 });
    }
    setLoading(false);
  }

  async function fetchInsights() {
    setInsightsLoading(true);
    const summary = positions
      .map((p) => `${p.symbol}: ${p.qty} units, P&L $${Number(p.unrealized_pl).toFixed(0)}`)
      .join(", ");
    try {
      const res = await aiChat(
        `Analyze this trading portfolio and give 4 concise, actionable insights:\n${summary}\nTotal value: $${Number(account?.portfolio_value || 48230).toFixed(0)}\n\nFocus on: concentration risk, positions to watch, upcoming catalysts, rebalancing suggestions. Under 150 words.`,
        "You are a senior portfolio risk manager. Give specific, actionable insights with ticker names and dollar amounts. No markdown headers or bullets — write in short paragraphs."
      );
      setInsights(res.content);
    } catch (e) {
      setInsights("Could not fetch AI insights. Check your Anthropic API key in .env");
    }
    setInsightsLoading(false);
  }

  const totalValue = account ? Number(account.portfolio_value) : 48230;
  const totalPnl = positions.reduce((s, p) => s + Number(p.unrealized_pl || 0), 0);
  const pnlPct = ((totalPnl / (totalValue - totalPnl)) * 100).toFixed(2);
  const maxAlloc = Math.max(...positions.map((p) => Math.abs(Number(p.market_value || 0))));

  if (loading) return <div className="loading-state">Loading portfolio data...</div>;

  return (
    <div className="tab-content">
      {usingDemo && (
        <div className="demo-banner">
          Demo mode — configure Alpaca API keys in <code>.env</code> to see live data
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard label="Total Value" value={`$${totalValue.toLocaleString()}`} />
        <MetricCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString("en", { maximumFractionDigits: 0 })}`}
          change={`${totalPnl >= 0 ? "+" : ""}${pnlPct}%`}
          positive={totalPnl >= 0}
        />
        <MetricCard label="Cash Available" value={`$${Number(account?.cash || 12000).toLocaleString()}`} />
        <MetricCard label="Open Positions" value={positions.length} change={`${positions.filter(p => p.asset_class === "forex").length} forex · ${positions.filter(p => p.asset_class !== "forex").length} equity`} />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Equity curve</span>
            <span className="card-subtitle">9-month</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={DEMO_EQUITY_CURVE}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, "Value"]} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#grad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Holdings</span>
            <button className="link-btn" onClick={loadData}>Refresh</button>
          </div>
          {positions.map((p) => (
            <div key={p.symbol} className="holding-row">
              <span className="holding-ticker">{p.symbol}</span>
              <div className="holding-bar-wrap">
                <div
                  className="holding-bar"
                  style={{ width: `${(Math.abs(Number(p.market_value)) / maxAlloc) * 100}%` }}
                />
              </div>
              <span className={`holding-pnl ${Number(p.unrealized_pl) >= 0 ? "pos" : "neg"}`}>
                {Number(p.unrealized_pl) >= 0 ? "+" : ""}${Number(p.unrealized_pl).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <span className="card-title">AI portfolio insights</span>
          <button className="link-btn" onClick={fetchInsights} disabled={insightsLoading}>
            {insightsLoading ? "Analyzing..." : "Refresh insights ↗"}
          </button>
        </div>
        <div className="insights-body">
          {insights || "Click 'Refresh insights' to get an AI analysis of your current portfolio."}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change, positive }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {change && <div className={`metric-change ${positive ? "pos" : positive === false ? "neg" : ""}`}>{change}</div>}
    </div>
  );
}
