'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ChartData {
  labels: string[];
  values: number[];
  title?: string;
  type?: 'bar' | 'line' | 'pie';
}

interface ChartRenderProps {
  data: ChartData;
}

function BarChartSVG({ labels, values, title }: ChartData) {
  const max = Math.max(...values, 1);
  const w = 400;
  const h = 200;
  const padL = 40;
  const padB = 50;
  const padTop = 30;
  const chartW = w - padL - 10;
  const chartH = h - padB - padTop;
  const barW = Math.min(chartW / labels.length - 6, 40);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-lg" style={{ height: '200px' }}>
      {title && (
        <text x={w / 2} y={16} textAnchor="middle" fill="#9ca3af" fontSize="11">{title}</text>
      )}
      {/* Y-axis */}
      <line x1={padL} y1={padTop} x2={padL} y2={padTop + chartH} stroke="#374151" strokeWidth="1" />
      <line x1={padL} y1={padTop + chartH} x2={w - 10} y2={padTop + chartH} stroke="#374151" strokeWidth="1" />

      {/* Y gridlines + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padTop + chartH * (1 - frac);
        const val = Math.round(max * frac);
        return (
          <g key={frac}>
            <line x1={padL} y1={y} x2={w - 10} y2={y} stroke="#1f2937" strokeWidth="1" strokeDasharray="3,3" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="9">{val}</text>
          </g>
        );
      })}

      {/* Bars */}
      {values.map((v, i) => {
        const barH = (v / max) * chartH;
        const x = padL + (chartW / labels.length) * i + (chartW / labels.length - barW) / 2;
        const y = padTop + chartH - barH;
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
        const color = colors[i % colors.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
            <text
              x={x + barW / 2}
              y={padTop + chartH + 14}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="9"
              style={{ maxWidth: `${barW}px` }}
            >
              {labels[i].length > 8 ? labels[i].substring(0, 8) + '…' : labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChartSVG({ labels, values, title }: ChartData) {
  const max = Math.max(...values, 1);
  // Use actual data min so positive-only datasets don't waste space with a forced 0 baseline
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 400;
  const h = 200;
  const padL = 40;
  const padB = 50;
  const padTop = 30;
  const chartW = w - padL - 10;
  const chartH = h - padB - padTop;

  const points = values.map((v, i) => {
    const x = padL + (chartW / (values.length - 1 || 1)) * i;
    const y = padTop + chartH - ((v - min) / range) * chartH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-lg" style={{ height: '200px' }}>
      {title && (
        <text x={w / 2} y={16} textAnchor="middle" fill="#9ca3af" fontSize="11">{title}</text>
      )}
      <line x1={padL} y1={padTop} x2={padL} y2={padTop + chartH} stroke="#374151" />
      <line x1={padL} y1={padTop + chartH} x2={w - 10} y2={padTop + chartH} stroke="#374151" />

      {[0, 0.5, 1].map((frac) => {
        const y = padTop + chartH * (1 - frac);
        const val = Math.round(min + range * frac);
        return (
          <g key={frac}>
            <line x1={padL} y1={y} x2={w - 10} y2={y} stroke="#1f2937" strokeDasharray="3,3" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="9">{val}</text>
          </g>
        );
      })}

      {/* Area fill */}
      <polyline
        points={[...points, `${padL + chartW},${padTop + chartH}`, `${padL},${padTop + chartH}`].join(' ')}
        fill="#3b82f6"
        fillOpacity="0.1"
        stroke="none"
      />
      {/* Line */}
      <polyline points={points.join(' ')} fill="none" stroke="#3b82f6" strokeWidth="2" />

      {/* Dots + labels */}
      {values.map((v, i) => {
        const x = padL + (chartW / (values.length - 1 || 1)) * i;
        const y = padTop + chartH - ((v - min) / range) * chartH;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="3" fill="#3b82f6" />
            <text x={x} y={padTop + chartH + 14} textAnchor="middle" fill="#9ca3af" fontSize="9">
              {labels[i].length > 8 ? labels[i].substring(0, 8) + '…' : labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChartSVG({ labels, values, title }: ChartData) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];
  const cx = 80;
  const cy = 80;
  const r = 65;

  let angle = -Math.PI / 2;
  const slices = values.map((v, i) => {
    const slice = (v / total) * 2 * Math.PI;
    const start = angle;
    angle += slice;
    return { start, end: angle, value: v, label: labels[i], color: colors[i % colors.length] };
  });

  const arcPath = (startA: number, endA: number, radius: number) => {
    const x1 = cx + radius * Math.cos(startA);
    const y1 = cy + radius * Math.sin(startA);
    const x2 = cx + radius * Math.cos(endA);
    const y2 = cy + radius * Math.sin(endA);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  return (
    <svg viewBox="0 0 320 180" className="w-full max-w-lg" style={{ height: '180px' }}>
      {title && (
        <text x={160} y={14} textAnchor="middle" fill="#9ca3af" fontSize="11">{title}</text>
      )}
      {slices.map((s, i) => (
        <path key={i} d={arcPath(s.start, s.end, r)} fill={s.color} opacity="0.85" transform="translate(0,20)" />
      ))}
      {/* Legend */}
      {slices.map((s, i) => (
        <g key={i} transform={`translate(170, ${30 + i * 18})`}>
          <rect width="10" height="10" fill={s.color} rx="2" />
          <text x="14" y="9" fill="#d1d5db" fontSize="10">
            {s.label.length > 12 ? s.label.substring(0, 12) + '…' : s.label} ({Math.round(s.value / total * 100)}%)
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ChartRender({ data }: ChartRenderProps) {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>(data.type || 'bar');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="my-3 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-blue-400" />
          <span className="text-xs text-gray-300 font-medium">{data.title || t('plugins.chart_title_fallback')}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Chart type switcher */}
          <div className="flex items-center gap-1">
            {(['bar', 'line', 'pie'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  chartType === type
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {type === 'bar' ? t('plugins.chart_type_bar') : type === 'line' ? t('plugins.chart_type_line') : t('plugins.chart_type_pie')}
              </button>
            ))}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 hover:text-gray-300">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 flex justify-center">
          {chartType === 'bar' && <BarChartSVG {...data} type={chartType} />}
          {chartType === 'line' && <LineChartSVG {...data} type={chartType} />}
          {chartType === 'pie' && <PieChartSVG {...data} type={chartType} />}
        </div>
      )}
    </div>
  );
}

// Utility: extract chart data from AI response JSON blocks
export function extractChartData(text: string): ChartData | null {
  // Look for JSON blocks that look like chart data
  const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    // Support various formats
    if (parsed.labels && parsed.values) {
      return {
        labels: parsed.labels,
        values: parsed.values.map(Number),
        title: parsed.title,
        type: parsed.type,
      };
    }

    // {label: value, ...} format
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed).filter(([, v]) => typeof v === 'number');
      if (entries.length >= 2) {
        return {
          labels: entries.map(([k]) => k),
          values: entries.map(([, v]) => v as number),
        };
      }
    }

    // [{name, value}, ...] format
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0].value !== undefined) {
      return {
        labels: parsed.map((item: Record<string, unknown>) => String(item.name || item.label || item.key || '')),
        values: parsed.map((item: Record<string, unknown>) => Number(item.value || item.count || item.amount || 0)),
        title: parsed[0]?.title,
      };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}
