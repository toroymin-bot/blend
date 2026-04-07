'use client';

import { useState, useRef } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useUsageStore } from '@/stores/usage-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
import { getModelById, calculateCost, DEFAULT_MODELS } from './model-registry';
import { Send, Square, Clock, DollarSign, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

export function ModelCompareView() {
  const { getKey, hasKey } = useAPIKeyStore();
  const { addRecord } = useUsageStore();
  const [prompt, setPrompt] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-4o-mini', 'claude-haiku-4-5', 'gemini-2.0-flash']);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const availableModels = DEFAULT_MODELS.filter((m) => m.enabled && hasKey(m.provider));

  const MAX_COMPARE_MODELS = 3;

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) return prev.filter((id) => id !== modelId);
      if (prev.length >= MAX_COMPARE_MODELS) return prev; // cap at 3
      return [...prev, modelId];
    });
  };

  const handleCompare = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;
    setIsRunning(true);

    const initialResults: ModelResult[] = selectedModels.map((modelId) => ({
      modelId,
      modelName: getModelById(modelId)?.name || modelId,
      content: '',
      isStreaming: true,
      startTime: Date.now(),
    }));
    setResults(initialResults);

    const promises = selectedModels.map(async (modelId) => {
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
        <h1 className="text-2xl font-bold text-white mb-2">모델 비교</h1>
        <p className="text-sm text-gray-400 mb-4">
          같은 질문을 여러 모델에 동시에 보내고 결과를 비교합니다{' '}
          <span className="text-gray-600">(최대 {MAX_COMPARE_MODELS}개)</span>
        </p>

        {/* Model selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {availableModels.map((m) => {
            const isSelected = selectedModels.includes(m.id);
            const isDisabled = !isSelected && selectedModels.length >= MAX_COMPARE_MODELS;
            return (
              <button
                key={m.id}
                onClick={() => toggleModel(m.id)}
                disabled={isDisabled}
                title={isDisabled ? `최대 ${MAX_COMPARE_MODELS}개까지 선택 가능` : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isDisabled
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {m.name}
              </button>
            );
          })}
          {availableModels.length === 0 && (
            <p className="text-sm text-gray-500">설정에서 API 키를 먼저 입력해주세요</p>
          )}
        </div>

        {/* Prompt input */}
        <div className="flex gap-2 mb-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="비교할 질문을 입력하세요..."
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
              <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><Clock size={12} /> 응답 시간</p>
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
                <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><DollarSign size={12} /> 비용</p>
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
                <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1"><Zap size={12} /> 출력 토큰</p>
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
          <div className={`grid gap-4 ${results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
                    <p className="text-red-400 text-sm">{result.error}</p>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
                    </div>
                  )}
                  {result.isStreaming && (
                    <div className="flex items-center gap-1 mt-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-xs text-gray-500">응답 중...</span>
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
