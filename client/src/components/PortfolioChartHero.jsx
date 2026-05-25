import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
} from 'recharts';
import usePortfolioHistory from '../hooks/usePortfolioHistory';

const PERIODS = ['1M', '3M', '6M', '1Y'];

function fmt(n, dec = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export default function PortfolioChartHero({ account, loading, onClick }) {
  const [period, setPeriod] = useState('1M');
  const { data: history } = usePortfolioHistory(period);

  const equity     = account?.equity      != null ? Number(account.equity)      : null;
  const lastEquity = account?.last_equity != null ? Number(account.last_equity) : null;
  const dayPL      = equity != null && lastEquity != null ? equity - lastEquity : null;
  const dayPLPct   = dayPL != null && lastEquity           ? (dayPL / lastEquity) * 100 : null;
  const isUp       = dayPL == null || dayPL >= 0;

  return (
    <div className="card ov-hero-card" onClick={onClick} title="View full portfolio">
      <div className="ov-hero-header">
        <div>
          <div className="ov-label">Portfolio value · tap to expand ↗</div>
          <div className="ov-hero-value">
            {loading ? '—' : equity != null ? `$${fmt(equity)}` : '—'}
          </div>
          {dayPL != null && (
            <div className={`ov-hero-pl ${isUp ? 'pos' : 'neg'}`}>
              {isUp ? '+' : '−'}${fmt(Math.abs(dayPL))} · {isUp ? '+' : '−'}{fmt(Math.abs(dayPLPct ?? 0))}% today
            </div>
          )}
        </div>

        {/* period toggle — stopPropagation so it doesn't trigger the card click */}
        <div className="ov-period-row" onClick={e => e.stopPropagation()}>
          {PERIODS.map(p => (
            <button
              key={p}
              className={`ov-period-btn${period === p ? ' active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="ov-chart-wrap">
        {history ? (
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#1D9E75" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#1D9E75" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#1D9E75"
                strokeWidth={1.8}
                fill="url(#heroGrad)"
                dot={false}
                isAnimationActive={false}
              />
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#e5e7eb',
                }}
                formatter={v => [`$${Number(v).toLocaleString()}`, 'Value']}
                labelFormatter={l => l}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          // Static SVG placeholder until Part 6 wires usePortfolioHistory
          <svg
            viewBox="0 0 580 70"
            style={{ width: '100%', display: 'block' }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="heroGradSvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#1D9E75" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"    />
              </linearGradient>
            </defs>
            <path
              d="M0,55 C30,52 60,45 90,40 C120,35 150,42 180,33 C210,24 240,28 270,21
                 C300,14 330,18 360,12 C390,6 420,9 450,6 C480,3 510,8 540,5
                 C560,2 570,3 580,2 L580,70 L0,70 Z"
              fill="url(#heroGradSvg)"
            />
            <path
              d="M0,55 C30,52 60,45 90,40 C120,35 150,42 180,33 C210,24 240,28 270,21
                 C300,14 330,18 360,12 C390,6 420,9 450,6 C480,3 510,8 540,5
                 C560,2 570,3 580,2"
              fill="none"
              stroke="#1D9E75"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
