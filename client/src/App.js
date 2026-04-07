import "./App.css";
import useAlpaca from "./hooks/useAlpaca";
import { useState } from "react";

import AssistantPanel from "./components/AssistantPanel";

// ⭐ You forgot this import — this is why your pages weren't rendering
import Dashboard from "./pages/Dashboard";

import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

function App() {
  const { account, positions, orders, loading, error } = useAlpaca();

  const [showAssistant, setShowAssistant] = useState(false);
  const [marketSnapshot, setMarketSnapshot] = useState(null);

  return (
    <Router>
      <div className="app-root">

        {/* Top Navigation */}
        <nav className="topnav">
          <div className="nav-left">
            <div className="logo">AlphaBot</div>
          </div>

          <div className="nav-center">
            <Link className="nav-item" to="/">Dashboard</Link>
            <Link className="nav-item" to="/research">Research</Link>
            <Link className="nav-item" to="/orders">Orders</Link>
            <Link className="nav-item" to="/positions">Positions</Link>

            <span
              className="nav-item"
              onClick={() => setShowAssistant(true)}
              style={{ cursor: "pointer" }}
            >
              AI Assistant
            </span>

            <Link className="nav-item" to="/settings">Settings</Link>
          </div>

          <div className="nav-right">
            <div className="user-pill">duan</div>
          </div>
        </nav>

        <main className="main">
          <Routes>

            {/* DASHBOARD PAGE */}
            <Route
              path="/"
              element={
                <Dashboard
                  account={account}
                  positions={positions}
                  orders={orders}
                  error={error}
                  marketSnapshot={marketSnapshot}
                  setMarketSnapshot={setMarketSnapshot}
                />
              }
            />

            {/* RESEARCH PAGE */}
            <Route
              path="/research"
              element={<h1>Research (placeholder)</h1>}
            />

            {/* ORDERS PAGE */}
            <Route
              path="/orders"
              element={<h1>Orders (placeholder)</h1>}
            />

            {/* POSITIONS PAGE */}
            <Route
              path="/positions"
              element={<h1>Positions (placeholder)</h1>}
            />

            {/* SETTINGS PAGE */}
            <Route
              path="/settings"
              element={<h1>Settings (placeholder)</h1>}
            />

          </Routes>
        </main>

        {/* Assistant Panel */}
        <AssistantPanel
          open={showAssistant}
          onClose={() => setShowAssistant(false)}
          account={account}
          positions={positions}
          orders={orders}
          marketSnapshot={marketSnapshot}
        />
      </div>
    </Router>
  );
}

export default App;
