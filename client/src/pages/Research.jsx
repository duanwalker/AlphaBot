import React from "react";
import { useLocation } from "react-router-dom";
import ResearchSentimentPanel from "../components/sentiment/ResearchSentimentPanel";
import RelevantArticlesPanel from "../components/news/RelevantArticlesPanel";

export default function Research() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const symbol = params.get("symbol")?.toUpperCase() || "AAPL";

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Research</h1>
        <p className="page-subtitle">Sentiment and recent articles for {symbol}.</p>
      </header>

      <div style={{ display: "grid", gap: 12 }}>
        <ResearchSentimentPanel symbol={symbol} />
        <RelevantArticlesPanel symbol={symbol} />
      </div>
    </div>
  );
}
