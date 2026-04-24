'use client';

import { useState, useEffect } from 'react';
import { useUsageStore } from '@/stores/usage-store';
import { getProviderColor } from '@/modules/models/model-registry';
import { BarChart3, DollarSign, Zap, TrendingUp, Clock, Activity, RefreshCw, ChevronDown, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useCountry } from '@/lib/use-country';

const KRW = 1380;
const PHP = 56;

function formatUSD(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return rounded % 1 === 0 ? `$${rounded}` : `$${rounded.toFixed(1)}`;
}
function formatDual(usd: number, country: string): string {
  const base = formatUSD(usd);
  if (country === 'KR') return `${base} (₩${Math.round(usd * KRW).toLocaleString()})`;
  if (country === 'PH') return `${base} (₱${Math.round(usd * PHP).toLocaleString()})`;
  return base;
}

// ── Provider Usage Links Dropdown ─────────────────────────────────────────────
const PROVIDER_LINKS = [
  { name: 'OpenAI',     logo: '🤖', url: 'https://platform.openai.com/usage',             color: '#10a37f' },
  { name: 'Anthropic',  logo: '🧠', url: 'https://console.anthropic.com/settings/usage',  color: '#d4a574' },
  { name: 'Google',     logo: '✨', url: 'https://aistudio.google.com/',                  color: '#4285f4' },
  { name: 'DeepSeek',   logo: '🐋', url: 'https://platform.deepseek.com/usage',           color: '#4D6BFE' },
  { name: 'Groq',       logo: '⚡', url: 'https://console.groq.com/settings/billing',     color: '#F55036' },
];

function ProviderLinksNotice({ t }: { t: (key: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mb-4">
      <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-3 py-2 text-xs text-on-surface-muted">
        <span>💡</span>
        <span>{t('dashboard.per_device_notice')}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors shrink-0"
        >
          <span>{t('dashboard.provider_links_btn')}</span>
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border-token rounded-xl shadow-lg z-10 overflow-hidden">
          {PROVIDER_LINKS.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface text-sm text-on-surface transition-colors"
            >
              <span>{p.logo}</span>
              <span className="font-medium" style={{ color: p.color }}>{p.name}</span>
              <span className="text-xs text-on-surface-muted ml-auto truncate max-w-[180px]">{p.url.replace('https://', '')}</span>
              <ExternalLink size={11} className="text-on-surface-muted shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────
function SVGBarChart({ data }: { data: { date: string; cost: number; requests: number }[] }) {
  const W = 600;
  const H = 160;
  const PAD = { top: 20, right: 10, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxCost = Math.max(...data.map((d) => d.cost), 0.0001);
  const barW = Math.floor(chartW / data.length) - 2;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ val: maxCost * f, y: chartH - chartH * f }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Daily cost bar chart">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {yTicks.map(({ val, y }) => (
          <g key={y}>
            <line x1={0} y1={y} x2={chartW} y2={y} stroke="#374151" strokeDasharray="4 3" strokeWidth={0.8} />
            <text x={-4} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280">
              ${val.toFixed(1)}
            </text>
          </g>
        ))}
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
              <text x={x + barW / 2} y={chartH + 12} textAnchor="middle" fontSize={8} fill="#6b7280">
                {d.date.slice(5)}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#4b5563" strokeWidth={1} />
      </g>
    </svg>
  );
}

// ── SVG Pie / Donut Chart ──────────────────────────────────────────────────────
function SVGPieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const { t } = useTranslation();
  const R = 60;
  const CX = 80;
  const CY = 80;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-on-surface-muted text-sm">{t('dashboard.no_data')}</p>;

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
      <svg viewBox={`0 0 160 160`} className="w-32 h-32 shrink-0" aria-label="Provider cost pie chart">
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
        <circle cx={CX} cy={CY} r={R * 0.5} fill="#1f2937" />
        <text x={CX} y={CY + 4} textAnchor="middle" fontSize={10} fill="#9ca3af">
          {t('dashboard.total_donut', { amount: Math.round(total) })}
        </text>
      </svg>
      <div className="space-y-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-on-surface capitalize">{s.label}</span>
            <span className="text-xs text-on-surface-muted ml-auto pl-3">${s.value.toFixed(1)}</span>
            <span className="text-xs text-on-surface-muted">({((s.value / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SVG Mini Line Chart ────────────────────────────────────────────────────────
function SVGLineChart({ data }: { data: { date: string; cost: number }[] }) {
  const W = 600;
  const H = 80;
  const PAD = { top: 8, right: 10, bottom: 18, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxCost = Math.max(...data.map((d) => d.cost), 0.0001);

  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * chartW,
    y: chartH - (d.cost / maxCost) * chartH,
    ...d,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${chartH} L 0 ${chartH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Mini line chart">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        <path d={areaD} fill="url(#areaGrad)" />
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r={3} fill="#3b82f6" />
        ))}
        {pts.map((p, i) => (
          (i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 5) === 0) && (
            <text key={p.date} x={p.x} y={chartH + 14} textAnchor="middle" fontSize={8} fill="#6b7280">
              {p.date.slice(5)}
            </text>
          )
        ))}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#4b5563" strokeWidth={1} />
      </g>
    </svg>
  );
}

// ── API Usage Breakdown Panel ──────────────────────────────────────────────────
const MODEL_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

function UsageBreakdownPanel({
  costByModel,
  tokensByModel,
  costByProvider,
}: {
  costByModel: Record<string, number>;
  tokensByModel: Record<string, { input: number; output: number }>;
  costByProvider: Record<string, number>;
}) {
  const { t } = useTranslation();

  const modelEntries = Object.entries(costByModel).sort(([, a], [, b]) => b - a);
  const totalCostAll = modelEntries.reduce((s, [, v]) => s + v, 0);

  const totalInput = Object.values(tokensByModel).reduce((s, v) => s + v.input, 0);
  const totalOutput = Object.values(tokensByModel).reduce((s, v) => s + v.output, 0);
  const totalTokens = totalInput + totalOutput;

  const providerEntries = Object.entries(costByProvider).sort(([, a], [, b]) => b - a);
  const totalProvCost = providerEntries.reduce((s, [, v]) => s + v, 0);

  if (totalCostAll === 0 && totalTokens === 0) return null;

  return (
    <div className="bg-surface-2 rounded-xl p-4 mb-4">
      <h2 className="text-sm font-medium text-on-surface-muted mb-4">{t('dashboard.usage_breakdown_title')}</h2>

      {/* Cost by Model */}
      {modelEntries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-on-surface-muted uppercase tracking-wider mb-2">{t('dashboard.breakdown_cost_by_model')}</p>
          <div className="space-y-1.5">
            {modelEntries.map(([model, cost], i) => {
              const pct = totalCostAll > 0 ? Math.round((cost / totalCostAll) * 100) : 0;
              const color = MODEL_COLORS[i % MODEL_COLORS.length];
              return (
                <div key={model} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs text-on-surface truncate flex-1 max-w-[140px]">{model}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden mx-1">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs text-on-surface-muted w-8 text-right shrink-0">{pct}%</span>
                  <span className="text-xs text-on-surface-muted w-10 text-right shrink-0">${cost.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Token breakdown */}
      {totalTokens > 0 && (
        <div className="mb-4">
          <p className="text-xs text-on-surface-muted uppercase tracking-wider mb-2">{t('dashboard.breakdown_token')}</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
              <span className="text-xs text-on-surface flex-1">{t('dashboard.input_tokens_label')}</span>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden mx-1">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${totalTokens > 0 ? Math.round((totalInput / totalTokens) * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-on-surface-muted w-8 text-right shrink-0">{totalTokens > 0 ? Math.round((totalInput / totalTokens) * 100) : 0}%</span>
              <span className="text-xs text-on-surface-muted w-14 text-right shrink-0">{(totalInput / 1000).toFixed(1)}K</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
              <span className="text-xs text-on-surface flex-1">{t('dashboard.output_tokens_label')}</span>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden mx-1">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${totalTokens > 0 ? Math.round((totalOutput / totalTokens) * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-on-surface-muted w-8 text-right shrink-0">{totalTokens > 0 ? Math.round((totalOutput / totalTokens) * 100) : 0}%</span>
              <span className="text-xs text-on-surface-muted w-14 text-right shrink-0">{(totalOutput / 1000).toFixed(1)}K</span>
            </div>
          </div>
        </div>
      )}

      {/* Usage by Provider */}
      {providerEntries.length > 0 && (
        <div>
          <p className="text-xs text-on-surface-muted uppercase tracking-wider mb-2">{t('dashboard.breakdown_by_provider')}</p>
          <div className="flex flex-wrap gap-2">
            {providerEntries.map(([provider, cost]) => {
              const pct = totalProvCost > 0 ? Math.round((cost / totalProvCost) * 100) : 0;
              return (
                <div key={provider} className="flex items-center gap-1.5 bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-medium text-on-surface capitalize">{provider}</span>
                  <span className="text-xs text-on-surface-muted">${cost.toFixed(1)}</span>
                  <span className="text-xs text-on-surface-muted">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const { t } = useTranslation();
  const { country } = useCountry();
  const {
    getTotalCost, getTodayCost, getThisMonthCost,
    getCostByModel, getCostByProvider, getCostByDay,
    getTokensByModel, getTotalRequests,
    loadFromStorage,
  } = useUsageStore();

  // [2026-04-25] Fix: null initial value avoids SSR/CSR timestamp mismatch (React #418)
  const [lastSync, setLastSync] = useState<Date | null>(null);
  useEffect(() => {
    setLastSync(new Date());
    loadFromStorage();
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadFromStorage();
        setLastSync(new Date());
      }
    }, 300_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 size={24} className="text-blue-400" />
            <h1 className="text-2xl font-bold text-on-surface">{t('dashboard.page_title')}</h1>
          </div>
          {lastSync && (
            <div className="flex items-center gap-1.5 text-xs text-on-surface-muted" suppressHydrationWarning>
              <RefreshCw size={11} />
              <span suppressHydrationWarning>{t('dashboard.last_updated', { min: Math.round((Date.now() - lastSync.getTime()) / 60000) })}</span>
            </div>
          )}
        </div>

        <ProviderLinksNotice t={t} />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-green-400" />
              <span className="text-sm text-on-surface-muted">{t('dashboard.today_cost')}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{formatDual(todayCost, country)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-blue-400" />
              <span className="text-sm text-on-surface-muted">{t('dashboard.month_cost')}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{formatDual(monthCost, country)}</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-900/40 to-surface-2 rounded-xl p-4 border border-yellow-700/30">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-yellow-400" />
              <span className="text-sm text-on-surface-muted">{t('dashboard.total_accumulated')}</span>
            </div>
            <p className="text-3xl font-bold text-yellow-300">{formatDual(totalCost, country)}</p>
            <p className="text-xs text-on-surface-muted mt-1">{t('dashboard.api_calls', { count: totalRequests })}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-purple-400" />
              <span className="text-sm text-on-surface-muted">{t('dashboard.total_requests')}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{totalRequests}</p>
          </div>
        </div>

        {/* API Usage Breakdown Panel */}
        <UsageBreakdownPanel
          costByModel={costByModel}
          tokensByModel={tokensByModel}
          costByProvider={costByProvider}
        />

        {/* SVG Daily cost bar chart — 7 days */}
        <div className="bg-surface-2 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-medium text-on-surface-muted mb-3">{t('dashboard.daily_cost_7')}</h2>
          {totalRequests === 0 ? (
            <div className="text-center text-on-surface-muted py-8">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('dashboard.no_usage_data')}</p>
              <p className="text-xs mt-1">{t('dashboard.start_chat_hint')}</p>
            </div>
          ) : (
            <SVGBarChart data={dailyCosts7} />
          )}
        </div>

        {/* SVG Mini Line Chart — 14 days trend */}
        <div className="bg-surface-2 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-2 flex items-center gap-1.5">
            <Activity size={13} /> {t('dashboard.daily_trend_14')}
          </h2>
          {totalRequests === 0 ? (
            <div className="text-center text-on-surface-muted py-4">
              <p className="text-sm">{t('dashboard.no_data')}</p>
            </div>
          ) : (
            <SVGLineChart data={dailyCosts14} />
          )}
        </div>

        <div className="mb-6">
          {/* Provider pie chart */}
          <div className="bg-surface-2 rounded-xl p-4">
            <h2 className="text-sm font-medium text-on-surface-muted mb-3">{t('dashboard.provider_breakdown')}</h2>
            <SVGPieChart data={providerPieData} />
          </div>
        </div>

        {/* Token usage stacked bar */}
        <div className="bg-surface-2 rounded-xl p-4">
          <h2 className="text-sm font-medium text-on-surface-muted mb-3">{t('dashboard.token_usage')}</h2>
          {Object.keys(tokensByModel).length === 0 ? (
            <p className="text-on-surface-muted text-sm">{t('dashboard.no_data')}</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(tokensByModel)
                .sort(([, a], [, b]) => (b.input + b.output) - (a.input + a.output))
                .map(([model, tokens], i) => {
                  const total = tokens.input + tokens.output;
                  const inputPct = total > 0 ? Math.round((tokens.input / total) * 100) : 0;
                  const color = MODEL_COLORS[i % MODEL_COLORS.length];
                  return (
                    <div key={model}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs text-on-surface truncate flex-1 max-w-[140px]">{model}</span>
                        <span className="text-xs text-on-surface-muted shrink-0">{(total / 1000).toFixed(1)}K {t('dashboard.tokens_label')}</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden flex mx-4">
                        <div className="bg-blue-500 h-full" style={{ width: `${inputPct}%` }} />
                        <div className="bg-green-500 h-full" style={{ width: `${100 - inputPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-on-surface-muted mt-0.5 mx-4">
                        <span>{t('dashboard.input_tokens_label')} {inputPct}%</span>
                        <span>{t('dashboard.output_tokens_label')} {100 - inputPct}%</span>
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
