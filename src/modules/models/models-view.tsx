'use client';

import { useState } from 'react';
import { DEFAULT_MODELS, getDisplayModels, getProviderColor, getModelCategory, MODEL_CATEGORY_META, PROVIDER_META, ModelCategory } from './model-registry';
import { useChatStore } from '@/stores/chat-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAgentStore } from '@/stores/agent-store';
import { Check } from 'lucide-react';
import { AIProvider } from '@/types';
import { useTranslation, getCurrentLanguage } from '@/lib/i18n';
import { AIModel } from '@/types';

const modelDesc = (m: AIModel) =>
  (getCurrentLanguage() === 'ko' ? m.descriptionKo || m.description : m.description) ?? '';

export function ModelsView({ onApply }: { onApply?: () => void }) {
  const { t } = useTranslation();
  const { selectedModel, setSelectedModel } = useChatStore();
  const { setActiveAgent } = useAgentStore();
  const { hasKey } = useAPIKeyStore();
  const { customModels } = useSettingsStore();

  // [2026-04-20] Apply family policy: max 2 per family, no dated versions
  const allModels = getDisplayModels(customModels);
  const providers = [...new Set(allModels.map((m) => m.provider))];
  const [activeProvider, setActiveProvider] = useState<string>('all');
  const [activeCategory, setActiveCategory] = useState<ModelCategory | 'all'>('all');

  const filteredModels = allModels.filter((m) => {
    if (activeProvider !== 'all' && m.provider !== activeProvider) return false;
    if (activeCategory !== 'all' && getModelCategory(m) !== activeCategory) return false;
    return true;
  });

  // Group by provider then category
  const groupedProviders = (activeProvider === 'all' ? providers : [activeProvider]).filter(
    (p) => filteredModels.some((m) => m.provider === p)
  );

  const enabledCount = allModels.filter((m) => hasKey(m.provider)).length;

  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">{t('models_view.title')}</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {t('models_view.total_count', { total: allModels.length, enabled: enabledCount })}
          </p>
        </div>

        {/* Provider filter tabs */}
        <div className="flex overflow-x-auto gap-1 mb-3 pb-1">
          <button
            onClick={() => setActiveProvider('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeProvider === 'all' ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t('models_view.all')}
          </button>
          {providers.map((p) => {
            const meta = PROVIDER_META[p] ?? { label: p, color: '#6b7280' };
            const hasProviderKey = hasKey(p);
            return (
              <button
                key={p}
                onClick={() => setActiveProvider(activeProvider === p ? 'all' : p)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                  activeProvider === p ? 'text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                } ${!hasProviderKey ? 'opacity-50' : ''}`}
                style={activeProvider === p ? { backgroundColor: meta.color } : {}}
              >
                {meta.label}
                {!hasProviderKey && <span className="text-[9px] opacity-70">{t('models_view.no_key_badge')}</span>}
              </button>
            );
          })}
        </div>

        {/* Category filter chips */}
        <div className="flex overflow-x-auto gap-1 mb-4 pb-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t('models_view.all_types')}
          </button>
          {(Object.entries(MODEL_CATEGORY_META) as [ModelCategory, typeof MODEL_CATEGORY_META[ModelCategory]][])
            .sort((a, b) => a[1].order - b[1].order)
            .map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(activeCategory === key ? 'all' : key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === key ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {meta.emoji} {t(meta.labelKey)}
              </button>
            ))}
        </div>

        {/* Model cards grouped by provider → category */}
        {groupedProviders.map((provider) => {
          const provMeta = PROVIDER_META[provider] ?? { label: provider, color: '#6b7280' };
          const hasProviderKey = hasKey(provider as AIProvider);
          const provModels = filteredModels.filter((m) => m.provider === provider);
          if (provModels.length === 0) return null;

          const categories = (Object.keys(MODEL_CATEGORY_META) as ModelCategory[])
            .sort((a, b) => MODEL_CATEGORY_META[a].order - MODEL_CATEGORY_META[b].order)
            .filter((cat) => provModels.some((m) => getModelCategory(m) === cat));

          return (
            <div key={provider} className="mb-6">
              {/* Provider header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: provMeta.color }} />
                <h2 className="text-sm font-bold text-white">{provMeta.label}</h2>
                {!hasProviderKey && (
                  <span className="text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
                    {t('models_view.no_api_key')}
                  </span>
                )}
              </div>

              {/* Category sections within this provider */}
              {(activeCategory === 'all' ? categories : categories.filter((c) => c === activeCategory)).map((cat) => {
                const catMeta = MODEL_CATEGORY_META[cat];
                const catModels = provModels.filter((m) => getModelCategory(m) === cat);
                if (catModels.length === 0) return null;

                return (
                  <div key={cat} className="mb-3">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 ml-0.5 flex items-center gap-1">
                      {catMeta.emoji} {t(catMeta.labelKey)}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {catModels.map((model) => {
                        const isSelected = selectedModel === model.id;
                        const noKey = !hasProviderKey;
                        return (
                          <button
                            key={model.id}
                            onClick={() => !noKey && setSelectedModel(model.id)}
                            disabled={noKey}
                            className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all flex items-center gap-3 ${
                              isSelected
                                ? 'border-transparent text-white shadow-lg'
                                : noKey
                                ? 'bg-gray-800/40 border-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-gray-800 border-gray-700/50 text-gray-300 hover:border-gray-600 hover:text-white'
                            }`}
                            style={isSelected ? { backgroundColor: provMeta.color + '25', borderColor: provMeta.color } : {}}
                          >
                            {/* Check indicator */}
                            <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border ${
                              isSelected ? 'border-transparent' : 'border-gray-600'
                            }`}
                              style={isSelected ? { backgroundColor: provMeta.color } : {}}
                            >
                              {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">{model.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isSelected && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: provMeta.color + '40', color: provMeta.color }}>
                                      {t('models_view.default_badge')}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-500">
                                    {model.contextLength >= 1000000
                                      ? `${(model.contextLength / 1000000).toFixed(1)}M ctx`
                                      : `${Math.round(model.contextLength / 1000)}K ctx`}
                                  </span>
                                  {isSelected && onApply && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveAgent(null);
                                        onApply();
                                      }}
                                      className="ml-1 px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg shrink-0"
                                    >
                                      적용
                                    </button>
                                  )}
                                </div>
                              </div>
                              {modelDesc(model) && (
                                <p className={`text-xs mt-0.5 ${isSelected ? 'text-gray-300' : noKey ? 'text-gray-700' : 'text-gray-500'}`}>
                                  {modelDesc(model)}
                                </p>
                              )}
                              {/* Feature badges */}
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {model.features.filter((f) => f !== 'streaming').map((f) => (
                                  <span key={f} className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                    isSelected ? 'bg-white/10 text-gray-300' : 'bg-gray-700 text-gray-500'
                                  }`}>
                                    {f === 'vision' ? t('models_view.feature_vision') : f === 'thinking' ? t('models_view.feature_thinking') : f === 'function_calling' ? t('models_view.feature_tools') : f}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {filteredModels.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">
            {t('models_view.no_models_found')}
          </div>
        )}
      </div>
    </div>
  );
}
