'use client';

import { useUsageStore } from '@/stores/usage-store';
import { getProviderColor } from '@/modules/models/model-registry';
import { BarChart3, DollarSign, Zap, TrendingUp, Clock } from 'lucide-react';

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
  const dailyCosts = getCostByDay(14);
  const tokensByModel = getTokensByModel();
  const totalRequests = getTotalRequests();

  const maxDailyCost = Math.max(...dailyCosts.map((d) => d.cost), 0.001);

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 size={24} className="text-blue-400" />
          <h1 className="text-2xl font-bold text-white">API 비용 분석</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-green-400" />
              <span className="text-sm text-gray-400">오늘 비용</span>
            </div>
            <p className="text-2xl font-bold text-white">${todayCost.toFixed(4)}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-blue-400" />
              <span className="text-sm text-gray-400">이번 달</span>
            </div>
            <p className="text-2xl font-bold text-white">${monthCost.toFixed(4)}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-yellow-400" />
              <span className="text-sm text-gray-400">전체 비용</span>
            </div>
            <p className="text-2xl font-bold text-white">${totalCost.toFixed(4)}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-purple-400" />
              <span className="text-sm text-gray-400">총 요청</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalRequests}</p>
          </div>
        </div>

        {/* Daily cost chart (CSS bar chart) */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">최근 14일 비용 추이</h2>
          {totalRequests === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>아직 사용 데이터가 없습니다</p>
              <p className="text-xs mt-1">AI와 대화를 시작하면 비용이 자동으로 추적됩니다</p>
            </div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {dailyCosts.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">${day.cost.toFixed(3)}</span>
                  <div
                    className="w-full bg-blue-500/80 rounded-t min-h-[2px] transition-all"
                    style={{ height: `${(day.cost / maxDailyCost) * 100}%` }}
                  />
                  <span className="text-[10px] text-gray-600">
                    {day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Cost by Provider */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-3">프로바이더별 비용</h2>
            {Object.keys(costByProvider).length === 0 ? (
              <p className="text-gray-500 text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costByProvider)
                  .sort(([, a], [, b]) => b - a)
                  .map(([provider, cost]) => (
                    <div key={provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getProviderColor(provider) }}
                        />
                        <span className="text-sm text-gray-300 capitalize">{provider}</span>
                      </div>
                      <span className="text-sm font-medium text-white">${cost.toFixed(4)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Cost by Model */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-gray-400 mb-3">모델별 비용</h2>
            {Object.keys(costByModel).length === 0 ? (
              <p className="text-gray-500 text-sm">데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costByModel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]) => {
                    const tokens = tokensByModel[model];
                    return (
                      <div key={model}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">{model}</span>
                          <span className="text-sm font-medium text-white">${cost.toFixed(4)}</span>
                        </div>
                        {tokens && (
                          <div className="flex gap-3 text-[10px] text-gray-500 mt-0.5">
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

        {/* Token usage */}
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">모델별 토큰 사용량</h2>
          {Object.keys(tokensByModel).length === 0 ? (
            <p className="text-gray-500 text-sm">데이터 없음</p>
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
                        <span className="text-sm text-gray-300">{model}</span>
                        <span className="text-xs text-gray-500">{(total / 1000).toFixed(1)}K 토큰</span>
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
                      <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
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
