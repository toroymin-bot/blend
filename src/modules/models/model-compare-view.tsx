'use client';

import { useState, useRef } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useUsageStore } from '@/stores/usage-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
import { getModelById, calculateCost, DEFAULT_MODELS, getModelCategory, MODEL_CATEGORY_META, PROVIDER_META, ModelCategory } from './model-registry';
import { Send, Square, Clock, DollarSign, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '@/lib/i18n';

interface ModelResult {
  modelId: string;
  modelName: string;
  content: string;
  isStreaming: boolean;
  error?: string;
  startTime: number;
  endTime?: number;
  tokens?: { input: number; output: number };
  cost?: number;
}

// ── 에러 → 번역 키 변환 ────────────────────────────────────────────────
function getFriendlyErrorKey(raw: string): { icon: string; msgKey: string } {
  const e = raw.toLowerCase();
  if (/insufficient.balance|insufficient_balance|balance|credit|quota|billing|payment|topup|top.up/i.test(e))
    return { icon: '💳', msgKey: 'compare_errors.insufficient_balance' };
  if (/decommission|no longer support|deprecated|removed|sunset/i.test(e))
    return { icon: '🚫', msgKey: 'compare_errors.decommissioned' };
  if (/no longer available|not available to new/i.test(e))
    return { icon: '🚫', msgKey: 'compare_errors.no_longer_available' };
  if (/invalid.api.key|invalid_api_key|incorrect.api.key|unauthorized|401/i.test(e))
    return { icon: '🔑', msgKey: 'compare_errors.invalid_api_key' };
  if (/rate.limit|too.many.request|429/i.test(e))
    return { icon: '⏳', msgKey: 'compare_errors.rate_limit' };
  if (/model.not.found|does.not.exist|no such model|404/i.test(e))
    return { icon: '❓', msgKey: 'compare_errors.model_not_found' };
  if (/context.length|max.tokens|too.long|input.too/i.test(e))
    return { icon: '📏', msgKey: 'compare_errors.context_too_long' };
  if (/network|fetch|connect|timeout|econnrefused/i.test(e))
    return { icon: '🌐', msgKey: 'compare_errors.network_error' };
  return { icon: '⚠️', msgKey: 'compare_errors.generic_error' };
}

export function ModelCompareView() {
  const { t } = useTranslation();
  const { getKey, hasKey } = useAPIKeyStore();
  const { addRecord } = useUsageStore();
  const [prompt, setPrompt] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>(() => DEFAULT_MODELS.filter((m) => m.enabled).slice(0, 2).map((m) => m.id));
  const [results, setResults] = useState<ModelResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const availableModels = DEFAULT_MODELS.filter((m) => m.enabled);
  const providers = [...new Set(availableModels.map((m) => m.provider))];
  const [activeProvider, setActiveProvider] = useState<string>(providers[0] ?? 'openai');

  const MAX_COMPARE_MODELS = 4;

  const activeSelectedCount = selectedModels.filter((id) => {
    const m = availableModels.find((m) => m.id === id);
    return m && hasKey(m.provider);
  }).length;

  const toggleModel = (modelId: string) => {
    const model = availableModels.find((m) => m.id === modelId);
    if (!model || !hasKey(model.provider)) return;
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) return prev.filter((id) => id !== modelId);
      const activeCount = prev.filter((id) => {
        const m = availableModels.find((m) => m.id === id);
        return m && hasKey(m.provider);
      }).length;
      if (activeCount >= MAX_COMPARE_MODELS) return prev;
      return [...prev, modelId];
    });
  };

  const handleCompare = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;
    setIsRunning(true);

    // availableModels(enabled만) 기준으로 필터 — disabled 모델이 몰래 실행되는 버그 수정
    const modelsToRun = selectedModels.filter((id) => {
      const m = availableModels.find((m) => m.id === id);
      return m && hasKey(m.provider);
    });

    const initialResults: ModelResult[] = modelsToRun.map((modelId) => ({
      modelId,
      modelName: getModelById(modelId)?.name || modelId,
      content: '',
      isStreaming: true,
      startTime: Date.now(),
    }));
    setResults(initialResults);

    const promises = modelsToRun.map(async (modelId) => {
      const model = getModelById(modelId);
      if (!model) return;

      const controller = new AbortController();
      abortRefs.current.set(modelId, controller);

      await sendChatRequest({
        messages: [{ role: 'user', content: prompt }],
        model: modelId,
        provider: model.provider,
        apiKey: getKey(model.provider),
        stream: true,
        signal: controller.signal,
        onChunk: (text) => {
          setResults((prev) =>
            prev.map((r) => r.modelId === modelId ? { ...r, content: r.content + text } : r)
          );
        },
        onDone: (fullText, usage) => {
          const cost = usage ? calculateCost(model, usage.input, usage.output) : undefined;
          setResults((prev) =>
            prev.map((r) =>
              r.modelId === modelId
                ? { ...r, content: fullText, isStreaming: false, endTime: Date.now(), tokens: usage, cost }
                : r
            )
          );
          if (usage) {
            addRecord({
              timestamp: Date.now(),
              model: modelId,
              provider: model.provider,
              inputTokens: usage.input,
              outputTokens: usage.output,
              cost: calculateCost(model, usage.input, usage.output),
              chatId: 'compare',
            });
          }
        },
        onError: (error) => {
          setResults((prev) =>
            prev.map((r) =>
              r.modelId === modelId
                ? { ...r, isStreaming: false, error, endTime: Date.now() }
                : r
            )
          );
        },
      });
    });

    await Promise.allSettled(promises);
    setIsRunning(false);
  };

  const handleStop = () => {
    abortRefs.current.forEach((controller) => controller.abort());
    setIsRunning(false);
    setResults((prev) => prev.map((r) => ({ ...r, isStreaming: false })));
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">{t('compare.title')}</h1>
        <p className="text-sm text-gray-400 mb-4">
          {t('compare.same_question')}{' '}
          <span className="text-gray-600">({t('compare.max_models', { count: MAX_COMPARE_MODELS })})</span>
        </p>

        {/* Model selector — provider tabs + category groups */}
        <div className="mb-4 bg-gray-800/60 rounded-2xl overflow-hidden border border-gray-700">
          {/* Provider tabs */}
          <div className="flex overflow-x-auto border-b border-gray-700">
            {providers.map((p) => {
              const meta = PROVIDER_META[p] ?? { label: p, color: '#6b7280' };
              const hasAnyKey = hasKey(p);
              return (
                <button
                  key={p}
                  onClick={() => setActiveProvider(p)}
                  className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeProvider === p
                      ? 'border-b-2 text-white bg-gray-700/50'
                      : 'text-gray-400 hover:text-gray-200'
                  } ${!hasAnyKey ? 'opacity-50' : ''}`}
                  style={activeProvider === p ? { borderBottomColor: meta.color } : {}}
                >
                  <span style={{ color: meta.color }}>●</span>
                  {meta.label}
                  {!hasAnyKey && <span className="text-[9px] text-red-400">{t('compare.no_key', { provider: meta.label })}</span>}
                </button>
              );
            })}
          </div>

          {/* Category groups for active provider */}
          <div className="p-3 space-y-3">
            {(Object.entries(MODEL_CATEGORY_META) as [ModelCategory, typeof MODEL_CATEGORY_META[ModelCategory]][])
              .sort((a, b) => a[1].order - b[1].order)
              .map(([catKey, catMeta]) => {
                const catModels = availableModels.filter(
                  (m) => m.provider === activeProvider && getModelCategory(m) === catKey
                );
                if (catModels.length === 0) return null;
                return (
                  <div key={catKey}>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      {catMeta.emoji} {t(catMeta.labelKey)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {catModels.map((m) => {
                        const isSelected = selectedModels.includes(m.id);
                        const noKey = !hasKey(m.provider);
                        const isDisabled = noKey || (!isSelected && activeSelectedCount >= MAX_COMPARE_MODELS);
                        const provColor = PROVIDER_META[m.provider]?.color ?? '#6b7280';
                        return (
                          <button
                            key={m.id}
                            onClick={() => toggleModel(m.id)}
                            disabled={isDisabled}
                            title={noKey ? t('compare.no_key', { provider: m.provider }) : isDisabled ? t('compare.max_models', { count: MAX_COMPARE_MODELS }) : m.description ?? ''}
                            className={`px-2.5 py-1.5 rounded-xl text-xs transition-all text-left border ${
                              isSelected
                                ? 'text-white border-transparent shadow-sm'
                                : noKey
                                ? 'bg-gray-800/30 text-gray-600 border-gray-700/50 cursor-not-allowed'
                                : isDisabled
                                ? 'bg-gray-800/50 text-gray-600 border-gray-700 cursor-not-allowed'
                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                            }`}
                            style={isSelected ? { backgroundColor: provColor + '33', borderColor: provColor } : {}}
                          >
                            <div className="font-medium leading-tight">{m.name}</div>
                            {m.description && (
                              <div className={`text-[10px] mt-0.5 leading-tight ${isSelected ? 'text-gray-200' : 'text-gray-500'}`}>
                                {m.description}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Selected models summary */}
        {selectedModels.filter(id => availableModels.find(m => m.id === id)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="text-xs text-gray-500 self-center">{t('compare.selected')}</span>
            {selectedModels.map((id) => {
              const m = availableModels.find((m) => m.id === id);
              if (!m || !hasKey(m.provider)) return null;
              const provColor = PROVIDER_META[m.provider]?.color ?? '#6b7280';
              return (
                <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white"
                  style={{ backgroundColor: provColor + '44', border: `1px solid ${provColor}66` }}>
                  <span style={{ color: provColor }}>●</span>
                  {m.name}
                  <button onClick={() => toggleModel(id)} className="ml-0.5 text-gray-300 hover:text-white">×</button>
                </span>
              );
            })}
          </div>
        )}

        {/* Prompt input */}
        <div className="flex gap-2 mb-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!isRunning) handleCompare();
              }
            }}
            placeholder={t('compare.compare_placeholder')}
            rows={2}
            className="flex-1 px-4 py-3 bg-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-500 outline-none resize-none focus:ring-1 focus:ring-blue-500"
          />
          {isRunning ? (
            <button onClick={handleStop} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl text-white">
              <Square size={18} />
            </button>
          ) : (
            <button
              onClick={handleCompare}
              disabled={!prompt.trim() || selectedModels.length === 0}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          )}
        </div>

        {/* Metrics comparison — shown once all results are complete */}
        {!isRunning && results.length > 0 && results.every((r) => r.endTime) && (
          <div className="mb-6 bg-gray-800 rounded-xl p-4 space-y-4">
            {/* Response time bars */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><Clock size={12} /> {t('compare.response_time')}</p>
              {(() => {
                const maxMs = Math.max(...results.map((r) => (r.endTime ?? r.startTime) - r.startTime));
                return results.map((r) => {
                  const ms = (r.endTime ?? r.startTime) - r.startTime;
                  const pct = maxMs > 0 ? (ms / maxMs) * 100 : 0;
                  return (
                    <div key={r.modelId} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-gray-400 w-28 shrink-0 truncate">{r.modelName}</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right shrink-0">{(ms / 1000).toFixed(1)}s</span>
                    </div>
                  );
                });
              })()}
            </div>
            {/* Cost bars (only if costs are available) */}
            {results.some((r) => r.cost !== undefined) && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><DollarSign size={12} /> {t('compare.cost')}</p>
                {(() => {
                  const maxCost = Math.max(...results.filter((r) => r.cost !== undefined).map((r) => r.cost!));
                  return results.map((r) => {
                    const cost = r.cost ?? 0;
                    const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
                    return (
                      <div key={r.modelId} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-gray-400 w-28 shrink-0 truncate">{r.modelName}</span>
                        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right shrink-0">${cost.toFixed(4)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
            {/* Token bars */}
            {results.some((r) => r.tokens) && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><Zap size={12} /> {t('compare.output_tokens')}</p>
                {(() => {
                  const maxTok = Math.max(...results.filter((r) => r.tokens).map((r) => r.tokens!.output));
                  return results.map((r) => {
                    const tok = r.tokens?.output ?? 0;
                    const pct = maxTok > 0 ? (tok / maxTok) * 100 : 0;
                    return (
                      <div key={r.modelId} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs text-gray-400 w-28 shrink-0 truncate">{r.modelName}</span>
                        <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right shrink-0">{tok} tok</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* Results grid */}
        {results.length > 0 && (
          <div className={`grid gap-4 ${results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-2' : results.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {results.map((result) => (
              <div key={result.modelId} className="bg-gray-800 rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <span className="font-medium text-white text-sm">{result.modelName}</span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {result.endTime && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {((result.endTime - result.startTime) / 1000).toFixed(1)}s
                      </span>
                    )}
                    {result.cost !== undefined && (
                      <span className="flex items-center gap-1">
                        <DollarSign size={10} />
                        ${result.cost.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto max-h-96">
                  {result.error ? (
                    (() => {
                      const { icon, msgKey } = getFriendlyErrorKey(result.error);
                      return (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-gray-700/40 border border-gray-600/40">
                          <span className="text-lg shrink-0">{icon}</span>
                          <span className="text-sm text-gray-300">{t(msgKey)}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
                    </div>
                  )}
                  {result.isStreaming && (
                    <div className="flex items-center gap-1 mt-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-xs text-gray-500">{t('compare.responding')}</span>
                    </div>
                  )}
                </div>
                {result.tokens && (
                  <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-2 text-xs text-gray-600">
                    <Zap size={10} />
                    {result.tokens.input}+{result.tokens.output} tokens
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
