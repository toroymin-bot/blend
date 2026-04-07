'use client';

import { useUsageStore } from '@/stores/usage-store';
import { getProviderColor } from '@/modules/models/model-registry';
import { BarChart3, DollarSign, Zap, TrendingUp, Clock } from 'lucide-react';

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────
function SVGBarChart({ data }: { data: { date: string; cost: number; requests: number }[] }) {
  const W = 600;
  const H = 160;
  const PAD = { top: 20, right: 10, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxCost = Math.max(...data.map((d) => d.cost), 0.0001);
  const barW = Math.floor(chartW / data.length) - 2;

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ val: maxCost * f, y: chartH - chartH * f }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="일별 비용 바 차트">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Grid lines + Y labels */}
        {yTicks.map(({ val, y }) => (
          <g key={y}>
            <line x1={0} y1={y} x2={chartW} y2={y} stroke="#374151" strokeDasharray="4 3" strokeWidth={0.8} />
            <text x={-4} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280">
              ${val.toFixed(val < 0.01 ? 5 : val < 0.1 ? 4 : 3)}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const barH = Math.max((d.cost / maxCost) * chartH, d.cost > 0 ? 2 : 0);
          const x = i * (chartW / data.length) + 1;
          const y = chartH - barH;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={barH} rx={2} fill="#3b82f6" opacity={0.85} />
              {d.requests > 0 && (
                <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#93c5fd">
                  {d.requests}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={chartH + 12}
                textAnchor="middle"
                fontSize={8}
                fill="#6b7280"
              >
                {d.date.slice(5)}
              </text>
            </g>
          );
        })}
        {/* X axis */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#4b5563" strokeWidth={1} />
      </g>
    </svg>
  );
}

// ── SVG Pie / Donut Chart ──────────────────────────────────────────────────────
function SVGPieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const R = 60;
  const CX = 80;
  const CY = 80;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-on-surface-muted text-sm">데이터 없음</p>;

  let cumAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const start = cumAngle;
    cumAngle += angle;
    return { ...d, start, angle };
  });

  const polarToXY = (angle: number, r: number) => ({
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 160 160`} className="w-32 h-32 shrink-0" aria-label="프로바이더 비율 파이차트">
        {slices.map((s) => {
          const p1 = polarToXY(s.start, R);
          const p2 = polarToXY(s.start + s.angle, R);
          const largeArc = s.angle > Math.PI ? 1 : 0;
          const d = [
            `M ${CX} ${CY}`,
            `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
            'Z',
          ].join(' ');
          return <path key={s.label} d={d} fill={s.color} stroke="#1f2937" strokeWidth={2} />;
        })}
        {/* Donut hole */}
        <circle cx={CX} cy={CY} r={R * 0.5} fill="#1f2937" />
        <text x={CX} y={CY + 4} textAnchor="middle" fontSize={10} fill="#9ca3af">
          총 ${total.toFixed(3)}
        </text>
      </svg>
      <div className="space-y-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-on-surface capitalize">{s.label}</span>
            <span className="text-xs text-on-surface-muted ml-auto pl-3">${s.value.toFixed(4)}</span>
            <span className="text-xs text-on-surface-muted">({((s.value / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardView() {
  const {
    getTotalCost, getTodayCost, getThisMonthCost,
    getCostByModel, getCostByProvider, getCostByDay,
    getTokensByModel, getTotalRequests,
  } = useUsageStore();

  const totalCost = getTotalCost();
  const todayCost = getTodayCost();
  const monthCost = getThisMonthCost();
  const costByModel = getCostByModel();
  const costByProvider = getCostByProvider();
  const dailyCosts7 = getCostByDay(7);
  const dailyCosts14 = getCostByDay(14);
  const tokensByModel = getTokensByModel();
  const totalRequests = getTotalRequests();

  const providerPieData = Object.entries(costByProvider)
    .sort(([, a], [, b]) => b - a)
    .map(([provider, cost]) => ({
      label: provider,
      value: cost,
      color: getProviderColor(provider),
    }));

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 size={24} className="text-blue-400" />
          <h1 className="text-2xl font-bold text-on-surface">API 비용 분석</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-green-400" />
              <span className="text-sm text-on-surface-muted">오늘 비용</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">${todayCost.toFixed(4)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-blue-400" />
              <span className="text-sm text-on-surface-muted">이번 달</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">${monthCost.toFixed(4)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-yellow-400" />
              <span className="text-sm text-on-surface-muted">전체 비용</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">${totalCost.toFixed(4)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-purple-400" />
              <span className="text-sm text-on-surface-muted">총 요청</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{totalRequests}</p>
          </div>
        </div>

        {/* SVG Daily cost bar chart — 7 days */}
        <div className="bg-surface-2 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-medium text-on-surface-muted mb-3">최근 7일 일별 비용 (SVG 바 차트)</h2>
          {totalRequests === 0 ? (
            <div className="text-center text-on-surface-muted py-8">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>아직 사용 데이터가 없습니다</p>
              <p className="text-xs mt-1">AI와 대화를 시작하면 비용이 자동으로 추적됩니다</p>
            </div>
          ) : (
            <SVGBarChart data={dailyCosts7} />
          )}
        </div>

        {/* SVG Daily cost bar chart — 14 days */}
        <div className="bg-surface-2 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-3">최근 14일 비용 추이</h2>
          {totalRequests === 0 ? (
            <div className="text-center text-on-surface-muted py-4">
              <p className="text-sm">데이터 없음</p>
            </div>
          ) : (
            <SVGBarChart data={dailyCosts14} />
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Provider pie chart */}
          <div className="bg-surface-2 rounded-xl p-4">
            <h2 className="text-sm font-medium text-on-surface-muted mb-3">프로바이더별 비용 비율</h2>
            <SVGPieChart data={providerPieData} />
          </div>

          {/* Cost by Model */}
          <div className="bg-surface-2 rounded-xl p-4">
            <h2 className="text-sm font-medium text-on-surface-muted mb-3">모델별 비용</h2>
            {Object.keys(costByModel).length === 0 ? (
              <p className="text-on-surface-muted text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costByModel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]) => {
                    const tokens = tokensByModel[model];
                    return (
                      <div key={model}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-on-surface">{model}</span>
                          <span className="text-sm font-medium text-on-surface">${cost.toFixed(4)}</span>
                        </div>
                        {tokens && (
                          <div className="flex gap-3 text-[10px] text-on-surface-muted mt-0.5">
                            <span>입력: {(tokens.input / 1000).toFixed(1)}K</span>
                            <span>출력: {(tokens.output / 1000).toFixed(1)}K</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Token usage stacked bar */}
        <div className="bg-surface-2 rounded-xl p-4">
          <h2 className="text-sm font-medium text-on-surface-muted mb-3">모델별 토큰 사용량</h2>
          {Object.keys(tokensByModel).length === 0 ? (
            <p className="text-on-surface-muted text-sm">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(tokensByModel)
                .sort(([, a], [, b]) => (b.input + b.output) - (a.input + a.output))
                .map(([model, tokens]) => {
                  const total = tokens.input + tokens.output;
                  const inputPct = (tokens.input / total) * 100;
                  return (
                    <div key={model}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-on-surface">{model}</span>
                        <span className="text-xs text-on-surface-muted">{(total / 1000).toFixed(1)}K 토큰</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${inputPct}%` }}
                          title={`입력: ${(tokens.input / 1000).toFixed(1)}K`}
                        />
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${100 - inputPct}%` }}
                          title={`출력: ${(tokens.output / 1000).toFixed(1)}K`}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-on-surface-muted mt-0.5">
                        <span>입력 {inputPct.toFixed(0)}%</span>
                        <span>출력 {(100 - inputPct).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
