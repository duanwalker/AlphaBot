import AccountCard from "../components/AccountCard";
import PositionsCard from "../components/PositionsCard";
import OrdersCard from "../components/OrdersCard";
import MarketSnapshot from "../components/MarketSnapshot";
import QuickActions from "../components/QuickActions";
import SentimentDashboardCard from "../components/sentiment/SentimentDashboardCard";
import HistoricalSparklineCard from "../components/HistoricalSparklineCard";

export default function Dashboard({
  account,
  positions,
  orders,
  error,
  loading,
  marketSnapshot,
  setMarketSnapshot,
  setActiveSymbol,
  activeSymbol
}) {
  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your trading overview at a glance.</p>
      </header>

      {error && <div className="alert error">{error}</div>}

      {/* Top Grid: Account, Market Snapshot, Historical, Quick Actions */}
      <section className="grid grid-4">
        <AccountCard
          account={account}
          loading={loading}
          error={error}
        />

        <MarketSnapshot
          onSnapshot={setMarketSnapshot}
          loading={loading}
          error={error}
        />

        <HistoricalSparklineCard symbol={activeSymbol || "AAPL"} />

        <QuickActions onSymbolSelected={setActiveSymbol} />
      </section>

      <section className="grid grid-1">
        <SentimentDashboardCard />
      </section>

      {/* Bottom Grid: Positions + Orders */}
      <section className="grid grid-2">
        <PositionsCard
          positions={positions}
          loading={loading}
          error={error}
        />

        <OrdersCard
          orders={orders}
          loading={loading}
          error={error}
        />
      </section>
    </>
  );
}
