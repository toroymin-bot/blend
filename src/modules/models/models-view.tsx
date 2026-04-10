'use client';

import { DEFAULT_MODELS, getProviderColor } from './model-registry';
import { useChatStore } from '@/stores/chat-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useSettingsStore } from '@/stores/settings-store';

export function ModelsView() {
  const { selectedModel, setSelectedModel } = useChatStore();
  const { hasKey } = useAPIKeyStore();
  const { customModels } = useSettingsStore();

  const allModels = [...DEFAULT_MODELS, ...customModels];
  const providers = [...new Set(allModels.map((m) => m.provider))];

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">모델 관리</h1>
        <p className="text-gray-400 text-sm mb-6">
          총 {allModels.length}개 모델 | 사용 가능: {allModels.filter((m) => hasKey(m.provider)).length}개
        </p>

        {providers.map((provider) => {
          const models = allModels.filter((m) => m.provider === provider);
          const color = getProviderColor(provider);
          const keySet = hasKey(provider);

          return (
            <div key={provider} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <h2 className="text-lg font-semibold text-white capitalize">{provider}</h2>
                {!keySet && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded">키 필요</span>}
              </div>

              <div className="grid gap-2">
                {models.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`bg-gray-800 rounded-xl p-4 cursor-pointer border-2 transition-colors ${
                      selectedModel === model.id ? 'border-blue-500' : 'border-transparent hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{model.name}</span>
                          {selectedModel === model.id && (
                            <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">기본</span>
                          )}
                        </div>
                        {model.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{model.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{(model.contextLength / 1000).toFixed(0)}K ctx</span>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {model.features.map((f) => (
                        <span key={f} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
