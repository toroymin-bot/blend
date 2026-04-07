'use client';

import { useState, useEffect } from 'react';
import { Puzzle, Search, Image, Code, BarChart3, Zap, Check, X } from 'lucide-react';
import { usePluginStore } from '@/stores/plugin-store';

interface PluginItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  comingSoon?: boolean;
}

const AVAILABLE_PLUGINS: PluginItem[] = [
  {
    id: 'web-search',
    name: '웹 검색',
    description: 'Brave Search로 최신 정보를 검색합니다. "!search 검색어" 또는 "?검색어" 패턴 사용',
    icon: <Search size={20} />,
    category: '검색',
    comingSoon: false,
  },
  {
    id: 'image-gen',
    name: '이미지 생성',
    description: 'DALL-E 3로 이미지를 생성합니다. "/image 프롬프트" 패턴 사용 (OpenAI 키 필요)',
    icon: <Image size={20} />,
    category: '이미지',
    comingSoon: false,
  },
  {
    id: 'code-runner',
    name: '코드 실행',
    description: 'JavaScript 코드를 안전한 샌드박스 환경에서 실행합니다',
    icon: <Code size={20} />,
    category: '개발',
    comingSoon: false,
  },
  {
    id: 'chart-render',
    name: '차트 생성',
    description: 'AI 응답의 JSON 데이터를 자동으로 차트로 시각화합니다',
    icon: <BarChart3 size={20} />,
    category: '데이터',
    comingSoon: false,
  },
  {
    id: 'url-reader',
    name: 'URL 읽기',
    description: '채팅에서 URL을 입력하면 내용을 자동으로 가져와 AI 컨텍스트에 포함합니다',
    icon: <Zap size={20} />,
    category: '생산성',
    comingSoon: false,
  },
];

export function PluginsView() {
  const { installedPlugins, installPlugin, uninstallPlugin, loadFromStorage } = usePluginStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFromStorage();
  }, []);

  const filteredPlugins = AVAILABLE_PLUGINS.filter(
    (p) => !searchQuery || p.name.includes(searchQuery) || p.description.includes(searchQuery)
  );

  const categories = [...new Set(AVAILABLE_PLUGINS.map((p) => p.category))];

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Puzzle size={24} /> 플러그인
            </h1>
            <p className="text-sm text-gray-400 mt-1">AI 기능을 확장하는 플러그인을 관리하세요</p>
          </div>
          <span className="text-xs text-gray-500">{installedPlugins.length}개 설치됨</span>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="플러그인 검색..."
            className="w-full px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => (
            <span key={cat} className="px-3 py-1 rounded-full text-xs bg-gray-800 text-gray-400">
              {cat}
            </span>
          ))}
        </div>

        {/* Plugin grid */}
        <div className="grid gap-3 md:grid-cols-2">
          {filteredPlugins.map((plugin) => {
            const installed = installedPlugins.includes(plugin.id);
            return (
              <div key={plugin.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      installed ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {plugin.icon}
                    </div>
                    <div>
                      <h3 className="font-medium text-white text-sm">{plugin.name}</h3>
                      <span className="text-xs text-gray-600">{plugin.category}</span>
                    </div>
                  </div>
                  {plugin.comingSoon ? (
                    <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">준비 중</span>
                  ) : installed ? (
                    <button
                      onClick={() => uninstallPlugin(plugin.id)}
                      className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded hover:bg-red-400/10 hover:text-red-400 transition-colors"
                      title="클릭하여 제거"
                    >
                      <Check size={12} /> 설치됨
                    </button>
                  ) : (
                    <button
                      onClick={() => installPlugin(plugin.id)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                    >
                      설치
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{plugin.description}</p>
                {installed && !plugin.comingSoon && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    <span className="text-xs text-green-400">활성화됨 - 채팅에서 사용 가능</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-2">플러그인 사용 방법</h3>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• <strong className="text-gray-400">URL 읽기</strong>: 채팅 입력창에 URL을 포함하면 자동으로 내용을 가져옵니다</li>
            <li>• <strong className="text-gray-400">코드 실행</strong>: AI가 생성한 JS 코드 블록에 &quot;실행&quot; 버튼이 나타납니다</li>
            <li>• <strong className="text-gray-400">차트 생성</strong>: AI 응답에서 JSON 데이터를 감지해 차트로 표시합니다</li>
            <li>• <strong className="text-gray-400">웹 검색</strong>: <code className="bg-gray-700 px-1 rounded">!search 검색어</code> 또는 <code className="bg-gray-700 px-1 rounded">?검색어</code>로 검색 (서버에 BRAVE_SEARCH_API_KEY 필요)</li>
            <li>• <strong className="text-gray-400">이미지 생성</strong>: <code className="bg-gray-700 px-1 rounded">/image 프롬프트</code>로 DALL-E 3 이미지 생성 (OpenAI 키 필요)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
