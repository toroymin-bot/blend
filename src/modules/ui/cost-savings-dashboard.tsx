'use client';

// Blend - Cost Savings Dashboard
// 각 AI 서비스 개별 구독료 vs Blend 통합 절약액 시각화

import { DollarSign, TrendingDown, Sparkles } from 'lucide-react';

// 시장 가격 기준 월 구독료 (USD, 2024년 기준)
const AI_SERVICES = [
  { name: 'ChatGPT Plus (GPT-4o)', price: 20, color: '#10a37f', logo: '🤖' },
  { name: 'Claude Pro (Opus/Sonnet)', price: 20, color: '#d4a574', logo: '🧠' },
  { name: 'Gemini Advanced', price: 19.99, color: '#4285f4', logo: '✨' },
  { name: 'Perplexity Pro', price: 20, color: '#6366f1', logo: '🔍' },
  { name: 'Midjourney (Basic)', price: 10, color: '#e11d48', logo: '🎨' },
];

// Blend 월 요금 — API 직접 사용 기준 (평균 사용량 가정)
const BLEND_MONTHLY_ESTIMATE = 5; // USD (API 키 직접 사용 시 평균)

interface CostSavingsDashboardProps {
  blendMonthly?: number; // 실제 이번 달 비용 (API 비용에서 가져옴)
}

export function CostSavingsDashboard({ blendMonthly = BLEND_MONTHLY_ESTIMATE }: CostSavingsDashboardProps) {
  const totalIndividual = AI_SERVICES.reduce((sum, s) => sum + s.price, 0);
  const savings = totalIndividual - blendMonthly;
  const savingsPercent = totalIndividual > 0 ? Math.round((savings / totalIndividual) * 100) : 0;
  const maxPrice = Math.max(...AI_SERVICES.map((s) => s.price));

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-6">
          <Sparkles size={24} className="text-yellow-400" />
          <h1 className="text-2xl font-bold text-on-surface">절약 대시보드</h1>
        </div>

        {/* 핵심 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* 개별 구독 합계 */}
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-red-400" />
              <span className="text-sm text-on-surface-muted">개별 구독 합계</span>
            </div>
            <p className="text-3xl font-bold text-red-300">${totalIndividual.toFixed(2)}</p>
            <p className="text-xs text-on-surface-muted mt-1">/ 월</p>
          </div>

          {/* Blend 요금 */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-blue-400">B</span>
              <span className="text-sm text-on-surface-muted">Blend (API 직접)</span>
            </div>
            <p className="text-3xl font-bold text-blue-300">~${blendMonthly.toFixed(2)}</p>
            <p className="text-xs text-on-surface-muted mt-1">/ 월 (이번 달 추정)</p>
          </div>

          {/* 절약액 */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={18} className="text-green-400" />
              <span className="text-sm text-on-surface-muted">절약액</span>
            </div>
            <p className="text-3xl font-bold text-green-300">${savings.toFixed(2)}</p>
            <p className="text-xs text-green-400 mt-1 font-medium">{savingsPercent}% 절약</p>
          </div>
        </div>

        {/* 절약률 시각화 */}
        <div className="bg-surface-2 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-4">비용 비교</h2>

          {/* Blend vs 개별 구독 비교 바 */}
          <div className="space-y-3 mb-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface">개별 구독 합계</span>
                <span className="text-red-300 font-medium">${totalIndividual.toFixed(2)}/월</span>
              </div>
              <div className="h-6 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/70 rounded-full flex items-center justify-end pr-2" style={{ width: '100%' }}>
                  <span className="text-xs text-red-200 font-medium">${totalIndividual.toFixed(0)}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface">Blend (API 직접 사용)</span>
                <span className="text-blue-300 font-medium">~${blendMonthly.toFixed(2)}/월</span>
              </div>
              <div className="h-6 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500/70 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(4, (blendMonthly / totalIndividual) * 100)}%` }}
                >
                  <span className="text-xs text-blue-200 font-medium">${blendMonthly.toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 절약 메시지 */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <p className="text-sm font-medium text-green-300">
                Blend로 매월 ${savings.toFixed(2)} 절약 ({savingsPercent}%)
              </p>
              <p className="text-xs text-on-surface-muted mt-0.5">
                1년이면 ${(savings * 12).toFixed(0)} 절약 — 개별 구독 없이 모든 AI를 하나의 앱으로
              </p>
            </div>
          </div>
        </div>

        {/* 서비스별 가격 비교 */}
        <div className="bg-surface-2 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-on-surface-muted mb-4">AI 서비스별 월 구독료 (시장가)</h2>
          <div className="space-y-3">
            {AI_SERVICES.map((service) => (
              <div key={service.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 text-sm text-on-surface">
                    <span>{service.logo}</span>
                    {service.name}
                  </span>
                  <span className="text-sm font-medium text-on-surface">${service.price}/월</span>
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

        {/* 면책 조항 */}
        <p className="text-xs text-on-surface-muted text-center">
          * 시장가는 2024년 기준 공개 구독 요금입니다. Blend API 비용은 실제 사용량에 따라 다릅니다.<br />
          API 직접 사용 시 필요한 기능에만 비용이 발생합니다.
        </p>
      </div>
    </div>
  );
}
