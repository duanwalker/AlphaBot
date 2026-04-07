// src/components/Trades.js
import React, { useState } from "react";
import { alpaca, oanda, aiChat } from "../services/api";

const EMPTY_TRADE = {
  ticker: "",
  type: "BUY",
  assetClass: "equity",
  shares: 10,
  estimatedPrice: 0,
  stopLoss: "",
  takeProfit: "",
  rationale: "",
  confidence: 70,
};

export default function Trades({ trades, setTrades }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_TRADE);
  const [execLog, setExecLog] = useState([]);
  const [generating, setGenerating] = useState(false);

  function log(msg) {
    setExecLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  }

  async function approveTrade(trade) {
    log(`Approving ${trade.type} ${trade.ticker}...`);
    try {
      if (trade.assetClass === "forex") {
        const instrument = trade.ticker.replace("/", "_");
        const units = trade.type === "BUY" ? trade.shares : -trade.shares;
        await oanda.placeOrder({
          type: "MARKET",
          instrument,
          units: String(units),
          ...(trade.stopLoss ? { stopLossOnFill: { price: String(trade.stopLoss) } } : {}),
          ...(trade.takeProfit ? { takeProfitOnFill: { price: String(trade.takeProfit) } } : {}),
        });
        log(`✓ OANDA order placed: ${trade.type} ${units} ${instrument}`);
      } else {
        const order = {
          symbol: trade.ticker,
          qty: String(trade.shares),
          side: trade.type.toLowerCase(),
          type: "market",
          time_in_force: "day",
          ...(trade.stopLoss
            ? { order_class: "bracket", stop_loss: { stop_price: String(trade.stopLoss) } }
            : {}),
        };
        await alpaca.placeOrder(order);
        log(`✓ Alpaca order placed: ${trade.type} ${trade.shares} ${trade.ticker}`);
      }
      setTrades((prev) =>
        prev.map((t) => (t.id === trade.id ? { ...t, status: "executed" } : t))
      );
    } catch (e) {
      log(`✗ Execution failed: ${e.message}`);
      setTrades((prev) =>
        prev.map((t) => (t.id === trade.id ? { ...t, status: "failed", error: e.message } : t))
      );
    }
  }

  function rejectTrade(id) {
    setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, status: "rejected" } : t)));
    log(`Trade ${id} rejected.`);
  }

  async function aiModify(trade) {
    const q = window.prompt(`Describe how you want to modify the ${trade.ticker} trade:`, "Change position size to 5 shares and tighten the stop loss");
    if (!q) return;
    try {
      const res = await aiChat(
        `Current trade: ${JSON.stringify(trade)}\nUser modification request: "${q}"\nReturn ONLY a JSON object with the modified trade fields. Do not include any other text.`,
        "You are a trading assistant. Return only valid JSON with these fields: ticker, type, assetClass, shares (number), estimatedPrice (number), stopLoss (number or null), takeProfit (number or null), rationale (string), confidence (number 0-100)."
      );
      const clean = res.content.replace(/```json|```/g, "").trim();
      const updated = JSON.parse(clean);
      setTrades((prev) => prev.map((t) => (t.id === trade.id ? { ...t, ...updated } : t)));
      log(`Trade ${trade.ticker} modified by AI.`);
    } catch (e) {
      alert("Could not parse AI response. Try a simpler modification request.");
    }
  }

  async function generateAITrades() {
    setGenerating(true);
    try {
      const res = await aiChat(
        `Generate 3 specific trade ideas for today. Assets: US equities (AAPL, MSFT, NVDA, TSLA, AMZN), forex (EUR/USD, GBP/JPY), SPY options. For each trade return a JSON array with objects having these fields: ticker, type (BUY or SELL), assetClass (equity/forex/option), shares (number), estimatedPrice (number), stopLoss (number), takeProfit (number), rationale (string, 1-2 sentences), confidence (number 50-90). Return ONLY a valid JSON array, no other text.`,
        "You are a quantitative trading system. Return ONLY a valid JSON array of trade objects. No markdown, no explanation, just the JSON array."
      );
      const clean = res.content.replace(/```json|```/g, "").trim();
      const aiTrades = JSON.parse(clean);
      const newTrades = aiTrades.map((t, i) => ({ ...t, id: Date.now() + i, status: "pending" }));
      setTrades((prev) => [...prev, ...newTrades]);
      log(`${newTrades.length} AI trade ideas generated.`);
    } catch (e) {
      log(`AI generation failed: ${e.message}`);
    }
    setGenerating(false);
  }

  function addManualTrade() {
    if (!form.ticker) return alert("Enter a ticker symbol.");
    setTrades((prev) => [...prev, { ...form, id: Date.now(), status: "pending" }]);
    setForm(EMPTY_TRADE);
    setShowForm(false);
    log(`Manual trade added: ${form.type} ${form.ticker}`);
  }

  const pending = trades.filter((t) => t.status === "pending");
  const executed = trades.filter((t) => t.status === "executed");
  const rejected = trades.filter((t) => t.status === "rejected" || t.status === "failed");

  return (
    <div className="tab-content">
      <div className="trades-toolbar">
        <button className="btn btn-primary" onClick={generateAITrades} disabled={generating}>
          {generating ? "Generating..." : "Generate AI trades ↗"}
        </button>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add manually"}
        </button>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: "auto" }}>
          {pending.length} pending · {executed.length} executed · {rejected.length} rejected
        </span>
      </div>

      {showForm && (
        <div className="card form-card">
          <div className="card-header"><span className="card-title">Add trade manually</span></div>
          <div className="form-grid">
            <label>Ticker<input className="text-input" value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})} placeholder="AAPL" /></label>
            <label>Direction
              <select className="text-input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option>BUY</option><option>SELL</option>
              </select>
            </label>
            <label>Asset class
              <select className="text-input" value={form.assetClass} onChange={e => setForm({...form, assetClass: e.target.value})}>
                <option value="equity">Equity</option>
                <option value="forex">Forex</option>
                <option value="option">Option</option>
              </select>
            </label>
            <label>Shares/Units<input className="text-input" type="number" value={form.shares} onChange={e => setForm({...form, shares: Number(e.target.value)})} /></label>
            <label>Est. price<input className="text-input" type="number" value={form.estimatedPrice} onChange={e => setForm({...form, estimatedPrice: Number(e.target.value)})} /></label>
            <label>Stop loss<input className="text-input" type="number" value={form.stopLoss} onChange={e => setForm({...form, stopLoss: e.target.value})} placeholder="optional" /></label>
          </div>
          <label style={{ display:"block", marginTop:8, fontSize:13 }}>Rationale
            <textarea className="text-input" style={{width:"100%",marginTop:4,height:60}} value={form.rationale} onChange={e => setForm({...form, rationale: e.target.value})} placeholder="Why this trade?" />
          </label>
          <button className="btn btn-primary" style={{marginTop:10}} onClick={addManualTrade}>Add trade</button>
        </div>
      )}

      {pending.length === 0 && !showForm && (
        <div className="empty-state">No pending trades. Generate AI trade ideas or add one manually.</div>
      )}

      {pending.map((trade) => (
        <TradeCard key={trade.id} trade={trade} onApprove={approveTrade} onReject={rejectTrade} onModify={aiModify} />
      ))}

      {executed.length > 0 && (
        <>
          <div className="section-label">Executed</div>
          {executed.map((trade) => <TradeCard key={trade.id} trade={trade} readOnly />)}
        </>
      )}

      {rejected.length > 0 && (
        <>
          <div className="section-label">Rejected / Failed</div>
          {rejected.map((trade) => <TradeCard key={trade.id} trade={trade} readOnly />)}
        </>
      )}

      {execLog.length > 0 && (
        <div className="card log-card">
          <div className="card-header"><span className="card-title">Execution log</span></div>
          <div className="log-body">
            {execLog.map((l, i) => <div key={i} className="log-line">{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeCard({ trade, onApprove, onReject, onModify, readOnly }) {
  const statusColor = trade.status === "executed" ? "#16a34a" : trade.status === "rejected" || trade.status === "failed" ? "#dc2626" : "";
  const total = (trade.shares * trade.estimatedPrice).toFixed(0);

  return (
    <div className={`card trade-card ${trade.status !== "pending" ? "trade-done" : ""}`}>
      <div className="trade-header-row">
        <span className="trade-ticker">{trade.ticker}</span>
        <span className={`badge ${trade.type === "BUY" ? "badge-buy" : "badge-sell"}`}>{trade.type}</span>
        <span className="trade-asset">{trade.assetClass}</span>
        {trade.confidence && <span className="trade-conf">{trade.confidence}% confidence</span>}
        {trade.status !== "pending" && <span style={{ marginLeft:"auto", fontSize:12, color: statusColor, fontWeight:500 }}>{trade.status.toUpperCase()}{trade.error ? `: ${trade.error}` : ""}</span>}
      </div>

      <div className="trade-details-grid">
        <div><div className="td-label">Shares</div><div className="td-val">{trade.shares}</div></div>
        <div><div className="td-label">Est. price</div><div className="td-val">{trade.estimatedPrice > 0 ? `$${trade.estimatedPrice}` : "market"}</div></div>
        <div><div className="td-label">Total</div><div className="td-val">{total > 0 ? `$${Number(total).toLocaleString()}` : "—"}</div></div>
        <div><div className="td-label">Stop loss</div><div className="td-val">{trade.stopLoss || "—"}</div></div>
      </div>

      {trade.rationale && (
        <div className="trade-rationale">{trade.rationale}</div>
      )}

      {!readOnly && trade.status === "pending" && (
        <div className="trade-actions">
          <button className="btn-approve" onClick={() => onApprove(trade)}>Approve & Execute</button>
          <button className="btn-reject" onClick={() => onReject(trade.id)}>Reject</button>
          <button className="btn" onClick={() => onModify(trade)}>AI Modify ↗</button>
        </div>
      )}
    </div>
  );
}
