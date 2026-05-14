import React, { useEffect, useMemo, useState } from "react";
import { getCompanyNews } from "../../services/newsApi";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function parseAlphaVantageDate(raw) {
  if (!raw) {
    return null;
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  const value = String(raw).trim();
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const [, year, month, day, hour, minute, second] = compact;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatPublished(rawPublished) {
  const date = parseAlphaVantageDate(rawPublished);
  if (!date) {
    return "Unknown date";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function trimSummary(summary) {
  if (!summary) {
    return "";
  }

  if (summary.length <= 180) {
    return summary;
  }

  return `${summary.slice(0, 177)}...`;
}

function SkeletonRow() {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 10,
        background: "rgba(15,23,42,0.35)",
        marginBottom: 8,
      }}
    >
      <div style={{ height: 13, width: "34%", background: "rgba(148,163,184,0.14)", borderRadius: 8, marginBottom: 8 }} />
      <div style={{ height: 14, width: "88%", background: "rgba(148,163,184,0.16)", borderRadius: 8, marginBottom: 8 }} />
      <div style={{ height: 12, width: "96%", background: "rgba(148,163,184,0.12)", borderRadius: 8 }} />
    </div>
  );
}

function getSentimentTone(article) {
  const numeric = Number(article?.overall_sentiment_score);
  const label = String(article?.overall_sentiment_label || "").toLowerCase();

  if (label.includes("bear") || (Number.isFinite(numeric) && numeric < -0.15)) {
    return {
      text: "Bearish",
      bg: "rgba(239,68,68,0.15)",
      border: "rgba(248,113,113,0.45)",
      color: "#fecaca",
    };
  }

  if (label.includes("bull") || (Number.isFinite(numeric) && numeric > 0.15)) {
    return {
      text: "Bullish",
      bg: "rgba(34,197,94,0.15)",
      border: "rgba(74,222,128,0.45)",
      color: "#bbf7d0",
    };
  }

  return {
    text: "Neutral",
    bg: "rgba(234,179,8,0.16)",
    border: "rgba(250,204,21,0.45)",
    color: "#fde68a",
  };
}

export default function RelevantArticlesPanel({ symbol }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!normalizedSymbol) {
      setArticles([]);
      setError("");
      setLoading(false);
      return;
    }

    let stale = false;

    async function loadArticles() {
      try {
        setLoading(true);
        setError("");

        const payload = await getCompanyNews(normalizedSymbol);
        if (stale) {
          return;
        }

        setArticles(Array.isArray(payload) ? payload.slice(0, 10) : []);
      } catch (err) {
        if (!stale) {
          setError(err?.message || "Unable to load news articles.");
          setArticles([]);
        }
      } finally {
        if (!stale) {
          setLoading(false);
        }
      }
    }

    loadArticles();

    return () => {
      stale = true;
    };
  }, [normalizedSymbol]);

  const title = useMemo(() => `Related News for: ${normalizedSymbol || "N/A"}`, [normalizedSymbol]);

  return (
    <section className="card">
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span className="card-title">{title}</span>
      </div>

      {loading && (
        <div>
          <p className="empty" style={{ marginBottom: 8 }}>Loading articles...</p>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {!loading && error && <p className="empty">Unable to load news articles.</p>}

      {!loading && !error && articles.length === 0 && (
        <p className="empty">
          No recent articles found.
          <br />
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            News feed returned no items for this symbol.
          </span>
        </p>
      )}

      {!loading && !error && articles.length > 0 && (
        <div>
          {articles.map((article, index) => (
            <article
              key={`${article.id || article.time_published || article.url}-${index}`}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 10,
                background: "rgba(15,23,42,0.34)",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {article.source || "Unknown source"} · {formatPublished(article.time_published)}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: `1px solid ${getSentimentTone(article).border}`,
                    color: getSentimentTone(article).color,
                    background: getSentimentTone(article).bg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {getSentimentTone(article).text}
                </span>
              </div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#bfdbfe", fontWeight: 700, textDecoration: "none", lineHeight: 1.4 }}
              >
                {article.title}
              </a>
              {(article.summary || article.source_domain) && (
                <p style={{ marginTop: 6, marginBottom: 0, color: "#cbd5e1", fontSize: 13, lineHeight: 1.45 }}>
                  {trimSummary(article.summary || article.source_domain)}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
