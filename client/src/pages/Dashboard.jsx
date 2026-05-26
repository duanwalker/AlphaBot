import PositionsCard from "../components/PositionsCard";
import MarketSnapshot from "../components/MarketSnapshot";
import PortfolioChartHero from "../components/PortfolioChartHero";
import PLCard from "../components/PLCard";
import OverviewSidebar from "../components/OverviewSidebar";
import SentimentDashboardCard from "../components/sentiment/SentimentDashboardCard";

export default function Dashboard({
  account,
  positions,
  orders,
  error,
  loading,
  marketSnapshot,
  setMarketSnapshot,
  setActiveSymbol,
  activeSymbol,
  setActiveTab,
}) {
  return (
    <>
      {error && <div className="alert error">{error}</div>}

      <div className="ov-layout">
        {/* ── Left column ── */}
        <div className="ov-left">
          <PortfolioChartHero
            account={account}
            loading={loading}
            onClick={() => setActiveTab?.('portfolio')}
          />

          <div className="ov-sub-grid">
            <PositionsCard
              positions={positions}
              loading={loading}
              error={error}
              scrollable
            />

            <div className="ov-right-stack">
              <MarketSnapshot
                onSnapshot={setMarketSnapshot}
                loading={loading}
                error={error}
              />
              <PLCard account={account} positions={positions} />
              <SentimentDashboardCard />
            </div>
          </div>
        </div>

        {/* ── Right: AlphaBot sidebar ── */}
        <OverviewSidebar
          account={account}
          positions={positions}
          orders={orders}
          marketSnapshot={marketSnapshot}
          activeSymbol={activeSymbol}
          onNavigateToAssistant={() => setActiveTab?.('assistant')}
        />
      </div>
    </>
  );
}
