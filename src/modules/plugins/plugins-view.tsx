'use client';

import { useState } from 'react';
import { Puzzle, Search, Image, Code, BarChart3, Zap, Check, X } from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  installed: boolean;
  comingSoon?: boolean;
}

const AVAILABLE_PLUGINS: PluginItem[] = [
  {
    id: 'web-search',
    name: '웹 검색',
    description: 'AI가 웹에서 최신 정보를 검색합니다 (SerpAPI/Perplexity)',
    icon: <Search size={20} />,
    category: '검색',
    installed: false,
    comingSoon: true,
  },
  {
    id: 'image-gen',
    name: '이미지 생성',
    description: 'DALL-E 3 또는 Stable Diffusion으로 이미지를 생성합니다',
    icon: <Image size={20} />,
    category: '이미지',
    installed: false,
    comingSoon: true,
  },
  {
    id: 'code-runner',
    name: '코드 실행',
    description: 'JavaScript/Python 코드를 브라우저에서 실행합니다',
    icon: <Code size={20} />,
    category: '개발',
    installed: false,
    comingSoon: true,
  },
  {
    id: 'chart-render',
    name: '차트 생성',
    description: 'AI가 데이터를 시각화된 차트로 렌더링합니다',
    icon: <BarChart3 size={20} />,
    category: '데이터',
    installed: false,
    comingSoon: true,
  },
  {
    id: 'url-reader',
    name: 'URL 읽기',
    description: '웹 페이지 URL을 입력하면 내용을 가져와 분석합니다',
    icon: <Zap size={20} />,
    category: '생산성',
    installed: false,
    comingSoon: true,
  },
];

export function PluginsView() {
  const [plugins, setPlugins] = useState(AVAILABLE_PLUGINS);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlugins = plugins.filter(
    (p) => !searchQuery || p.name.includes(searchQuery) || p.description.includes(searchQuery)
  );

  const categories = [...new Set(plugins.map((p) => p.category))];

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
          {filteredPlugins.map((plugin) => (
            <div key={plugin.id} className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">
                    {plugin.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-white text-sm">{plugin.name}</h3>
                    <span className="text-xs text-gray-600">{plugin.category}</span>
                  </div>
                </div>
                {plugin.comingSoon ? (
                  <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">준비 중</span>
                ) : plugin.installed ? (
                  <button className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                    <Check size={12} /> 설치됨
                  </button>
                ) : (
                  <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">
                    설치
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400">{plugin.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-2">커스텀 플러그인 개발</h3>
          <p className="text-xs text-gray-500">
            Blend 플러그인 API를 사용하여 자체 플러그인을 개발할 수 있습니다.
            각 플러그인은 독립 모듈로 동작하며, 다른 프로젝트에서도 재사용 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
