'use client';

// Blend - Cost Savings Dashboard

import { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, Sparkles, RefreshCw } from 'lucide-react';
import { useUsageStore } from '@/stores/usage-store';
import { useTranslation } from '@/lib/i18n';
import { useCountry } from '@/lib/use-country';

function formatDual(usd: number, country: string): string {
  if (country === 'KR') return `$${usd.toFixed(1)} (₩${Math.round(usd * 1380).toLocaleString()})`;
  if (country === 'PH') return `$${usd.toFixed(1)} (₱${Math.round(usd * 56).toLocaleString()})`;
  return `$${usd.toFixed(1)}`;
}

// Monthly subscription prices (USD, 2026 market rates)
const AI_SERVICES = [
  { name: 'ChatGPT Plus (GPT-4o)', price: 20, color: '#10a37f', logo: '🤖' },
  { name: 'Claude Pro (Opus/Sonnet)', price: 20, color: '#d4a574', logo: '🧠' },
  { name: 'Gemini Advanced', price: 19.99, color: '#4285f4', logo: '✨' },
  { name: 'Perplexity Pro', price: 20, color: '#6366f1', logo: '🔍' },
  { name: 'Midjourney (Basic)', price: 10, color: '#e11d48', logo: '🎨' },
];

// Blend monthly estimate — direct API usage (average usage assumed)
const BLEND_MONTHLY_ESTIMATE = 5; // USD

interface CostSavingsDashboardProps {
  blendMonthly?: number;
}

export function CostSavingsDashboard({ blendMonthly = BLEND_MONTHLY_ESTIMATE }: CostSavingsDashboardProps) {
  const { t } = useTranslation();
  const { country } = useCountry();
  const { getThisMonthCost, loadFromStorage } = useUsageStore();

  // [2026-04-16 01:15] Bug fix: 5-minute auto-sync — reload usage data from localStorage
  const [lastSync, setLastSync] = useState<Date>(new Date());
  useEffect(() => {
    loadFromStorage();
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadFromStorage();
        setLastSync(new Date());
      }
    }, 300_000); // 5 minutes
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use actual monthly spend from usage store for Blend cost display
  const actualMonthly = getThisMonthCost();
  // [2026-04-16 01:15] was: const effectiveBlendMonthly = blendMonthly (hardcoded static estimate)
  const effectiveBlendMonthly = actualMonthly > 0 ? actualMonthly : blendMonthly;

  const totalIndividual = AI_SERVICES.reduce((sum, s) => sum + s.price, 0);
  // [2026-04-16 01:15] was: const savings = totalIndividual - blendMonthly
  const savings = totalIndividual - effectiveBlendMonthly;
  const savingsPercent = totalIndividual > 0 ? Math.round((savings / totalIndividual) * 100) : 0;
  const maxPrice = Math.max(...AI_SERVICES.map((s) => s.price));

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <Sparkles size={24} className="text-yellow-400" />
            <h1 className="text-2xl font-bold text-on-surface">{t('savings_view.title')}</h1>
          </div>
          {/* [2026-04-16 01:15] 5-minute auto-sync last-updated indicator */}
          <div className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            <RefreshCw size={11} />
            <span>{t('dashboard.last_updated', { min: Math.round((Date.now() - lastSync.getTime()) / 60000) })}</span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Individual subscriptions total */}
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-red-400" />
              <span className="text-sm text-on-surface-muted">{t('savings_view.individual_total')}</span>
            </div>
            <p className="text-3xl font-bold text-red-300">{formatDual(totalIndividual, country)}</p>
            <p className="text-xs text-on-surface-muted mt-1">{t('savings_view.per_month')}</p>
          </div>

          {/* Blend price */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-blue-400">B</span>
              <span className="text-sm text-on-surface-muted">{t('savings_view.blend_label')}</span>
            </div>
            <p className="text-3xl font-bold text-blue-300">~{formatDual(effectiveBlendMonthly, country)}</p>
            <p className="text-xs text-on-surface-muted mt-1">{t('savings_view.month_estimate')}</p>
          </div>

          {/* Savings */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={18} className="text-green-400" />
              <span className="text-sm text-on-surface-muted">{t('savings_view.savings_label')}</span>
            </div>
            <p className="text-3xl font-bold text-green-300">{formatDual(savings, country)}</p>
            <p className="text-xs text-green-400 mt-1 font-medium">{t('savings_view.savings_pct', { pct: savingsPercent })}</p>
          </div>
        </div>

        {/* Cost visualization */}
        <div className="bg-surface-2 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-4">{t('savings_view.cost_comparison')}</h2>

          {/* Blend vs individual comparison bars */}
          <div className="space-y-3 mb-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface">{t('savings_view.individual_total_label')}</span>
                <span className="text-red-300 font-medium">${Math.round(totalIndividual)}/{t('savings_view.per_month').replace('/ ', '')}</span>
              </div>
              <div className="h-6 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/70 rounded-full flex items-center justify-end pr-2" style={{ width: '100%' }}>
                  <span className="text-xs text-red-200 font-medium">${totalIndividual.toFixed(0)}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface">{t('savings_view.blend_direct')}</span>
                <span className="text-blue-300 font-medium">~${Math.round(effectiveBlendMonthly)}/{t('savings_view.per_month').replace('/ ', '')}</span>
              </div>
              <div className="h-6 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/70 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(4, (effectiveBlendMonthly / totalIndividual) * 100)}%` }}
                >
                  <span className="text-xs text-blue-200 font-medium">${effectiveBlendMonthly.toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Savings message */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <p className="text-sm font-medium text-green-300">
                {t('savings_view.savings_message', { amount: Math.round(savings), pct: savingsPercent })}
              </p>
              <p className="text-xs text-on-surface-muted mt-0.5">
                {t('savings_view.yearly_savings', { amount: (savings * 12).toFixed(0) })}
              </p>
            </div>
          </div>
        </div>

        {/* Service pricing comparison */}
        <div className="bg-surface-2 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-4">{t('savings_view.service_pricing')}</h2>
          <div className="space-y-3">
            {AI_SERVICES.map((service) => (
              <div key={service.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 text-sm text-on-surface">
                    <span>{service.logo}</span>
                    {service.name}
                  </span>
                  <span className="text-sm font-medium text-on-surface">${service.price}/{t('savings_view.per_month').replace('/ ', '')}</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(service.price / maxPrice) * 100}%`,
                      backgroundColor: service.color,
                      opacity: 0.75,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-on-surface-muted text-center">
          {t('savings_view.disclaimer').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 ? <br /> : null}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
