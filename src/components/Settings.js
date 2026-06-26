// src/components/Settings.js
import React, { useState, useEffect } from "react";
import { health, getTradingMode } from "../services/api";
import { useTradingMode } from "../context/TradingModeContext";

const DEFAULT_SETTINGS = {
  maxPositionSize: 5000,
  maxDailyLoss: 500,
  maxOpenPositions: 10,
  autoStopLoss: true,
  requireApproval: true,
  minConfidence: 65,
  scanFrequency: "60",
  includeEarnings: true,
  includeMacro: true,
  paperMode: true,
};

export default function Settings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("alphabot_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [apiStatus, setApiStatus] = useState(null);
  const [saved, setSaved] = useState(false);
  const { updateTradingMode } = useTradingMode();

  useEffect(() => {
    checkHealth();
    getTradingMode()
      .then(({ mode }) => set("paperMode", mode === "paper"))
      .catch(() => { /* keep localStorage value */ });
  }, []);

  async function checkHealth() {
    try {
      const h = await health();
      setApiStatus(h);
    } catch {
      setApiStatus({ status: "error", configured: {} });
    }
  }

  function saveSettings() {
    localStorage.setItem("alphabot_settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function set(key, val) {
    setSettings((s) => ({ ...s, [key]: val }));
  }

  return (
    <div className="tab-content">
      <div className="two-col">
        <div className="card">
          <div className="card-header"><span className="card-title">API status</span>
            <button className="link-btn" onClick={checkHealth}>Refresh</button>
          </div>
          {apiStatus ? (
            <div>
              <StatusRow label="Backend server" ok={apiStatus.status === "ok"} />
              <StatusRow label="Anthropic (AI)" ok={apiStatus.configured?.anthropic} />
              <StatusRow label="Alpaca (stocks/options)" ok={apiStatus.configured?.alpaca} />
              <StatusRow label="OANDA (forex)" ok={apiStatus.configured?.oanda} />
              <StatusRow label="Alpha Vantage (data)" ok={apiStatus.configured?.alphaVantage} />
            </div>
          ) : (
            <div className="empty-state">Checking connection to backend...</div>
          )}
          <div style={{marginTop:12, padding:"10px 12px", background:"var(--color-background-secondary)", borderRadius:"var(--border-radius-md)", fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.6}}>
            To configure API keys, edit the <code>.env</code> file in the project root and restart both servers. See <code>README.md</code> for full setup instructions.
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Risk controls</span></div>
          <SettingRow label="Max position size ($)">
            <input className="text-input small" type="number" value={settings.maxPositionSize} onChange={e => set("maxPositionSize", Number(e.target.value))} />
          </SettingRow>
          <SettingRow label="Max daily loss ($)">
            <input className="text-input small" type="number" value={settings.maxDailyLoss} onChange={e => set("maxDailyLoss", Number(e.target.value))} />
          </SettingRow>
          <SettingRow label="Max open positions">
            <select className="text-input small" value={settings.maxOpenPositions} onChange={e => set("maxOpenPositions", Number(e.target.value))}>
              {[5,10,15,20].map(n => <option key={n}>{n}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="Auto stop-loss on new trades">
            <Toggle on={settings.autoStopLoss} onChange={v => set("autoStopLoss", v)} />
          </SettingRow>
          <SettingRow label="Require approval before execution">
            <Toggle on={settings.requireApproval} onChange={v => set("requireApproval", v)} />
          </SettingRow>
          <SettingRow label="Paper trading mode">
            <Toggle on={settings.paperMode} onChange={v => {
              set("paperMode", v);
              updateTradingMode(v ? "paper" : "live");
            }} />
          </SettingRow>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Signal preferences</span></div>
          <SettingRow label={`Min signal confidence: ${settings.minConfidence}%`}>
            <input type="range" min="50" max="95" value={settings.minConfidence} onChange={e => set("minConfidence", Number(e.target.value))} style={{width:140}} />
          </SettingRow>
          <SettingRow label="Signal scan frequency">
            <select className="text-input small" value={settings.scanFrequency} onChange={e => set("scanFrequency", e.target.value)}>
              <option value="30">Every 30 min</option>
              <option value="60">Every hour</option>
              <option value="240">Every 4 hours</option>
              <option value="1440">Once daily</option>
            </select>
          </SettingRow>
          <SettingRow label="Include earnings calendar context">
            <Toggle on={settings.includeEarnings} onChange={v => set("includeEarnings", v)} />
          </SettingRow>
          <SettingRow label="Include macro event context">
            <Toggle on={settings.includeMacro} onChange={v => set("includeMacro", v)} />
          </SettingRow>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">About AlphaBot</span></div>
          <div style={{fontSize:13, color:"var(--color-text-secondary)", lineHeight:1.7}}>
            <p><strong>Version:</strong> 1.0.0</p>
            <p style={{marginTop:8}}><strong>Stack:</strong> React · Node.js/Express · Claude AI · Alpaca API · OANDA API · Alpha Vantage</p>
            <p style={{marginTop:8}}><strong>Data:</strong> All trading is on paper (simulated) by default. Switch to live trading only when you have connected live API keys and disabled paper mode.</p>
            <p style={{marginTop:8, color:"#dc2626"}}><strong>Risk warning:</strong> This tool is for educational and research purposes. Always review AI-generated trade ideas critically before execution. Past performance does not guarantee future results.</p>
          </div>
        </div>
      </div>

      <div style={{marginTop:16}}>
        <button className="btn btn-primary" onClick={saveSettings}>
          {saved ? "✓ Saved" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, ok }) {
  return (
    <div className="setting-row">
      <span style={{fontSize:13}}>{label}</span>
      <span style={{fontSize:12, fontWeight:500, color: ok ? "#16a34a" : "#dc2626"}}>
        {ok ? "✓ Connected" : "✗ Not configured"}
      </span>
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="setting-row">
      <span style={{fontSize:13}}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <div className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
  );
}
