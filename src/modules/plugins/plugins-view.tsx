'use client';

import { useState, useEffect } from 'react';
import { Puzzle, Search, Image, Code, BarChart3, Zap, Check } from 'lucide-react';
import { usePluginStore } from '@/stores/plugin-store';
import { useTranslation } from '@/lib/i18n';

interface PluginItem {
  id: string;
  nameKey: string;
  descKey: string;
  catKey: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

const AVAILABLE_PLUGINS: PluginItem[] = [
  {
    id: 'web-search',
    nameKey: 'plugins.web_search',
    descKey: 'plugins_view.web_search_desc',
    catKey: 'plugins_view.cat_search',
    icon: <Search size={20} />,
  },
  {
    id: 'image-gen',
    nameKey: 'plugins.image_gen',
    descKey: 'plugins_view.image_gen_desc',
    catKey: 'plugins_view.cat_image',
    icon: <Image size={20} />,
  },
  {
    id: 'code-runner',
    nameKey: 'plugins_view.code_runner',
    descKey: 'plugins_view.code_runner_desc',
    catKey: 'plugins_view.cat_dev',
    icon: <Code size={20} />,
  },
  {
    id: 'chart-render',
    nameKey: 'plugins.chart_render',
    descKey: 'plugins_view.chart_render_desc',
    catKey: 'plugins_view.cat_data',
    icon: <BarChart3 size={20} />,
  },
  {
    id: 'url-reader',
    nameKey: 'plugins.url_reader',
    descKey: 'plugins_view.url_reader_desc',
    catKey: 'plugins_view.cat_productivity',
    icon: <Zap size={20} />,
  },
];

export function PluginsView() {
  const { t } = useTranslation();
  const { installedPlugins, installPlugin, uninstallPlugin, loadFromStorage } = usePluginStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFromStorage();
  }, []);

  const filteredPlugins = AVAILABLE_PLUGINS.filter(
    (p) => !searchQuery || t(p.nameKey).toLowerCase().includes(searchQuery.toLowerCase()) || t(p.descKey).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const catKeys = [...new Set(AVAILABLE_PLUGINS.map((p) => p.catKey))];

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Puzzle size={24} /> {t('plugins.title')}
            </h1>
            <p className="text-sm text-gray-400 mt-1">{t('plugins_view.subtitle')}</p>
          </div>
          <span className="text-xs text-gray-500">{t('plugins_view.installed_count', { count: installedPlugins.length })}</span>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('plugins_view.search_placeholder')}
            className="w-full px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {catKeys.map((catKey) => (
            <span key={catKey} className="px-3 py-1 rounded-full text-xs bg-gray-800 text-gray-400">
              {t(catKey)}
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
                      <h3 className="font-medium text-white text-sm">{t(plugin.nameKey)}</h3>
                      <span className="text-xs" style={{ color: '#adadb2' }}>{t(plugin.catKey)}</span>
                    </div>
                  </div>
                  {plugin.comingSoon ? (
                    <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">{t('plugins_view.coming_soon')}</span>
                  ) : installed ? (
                    <button
                      onClick={() => uninstallPlugin(plugin.id)}
                      className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded hover:bg-red-400/10 hover:text-red-400 transition-colors"
                      title={t('plugins_view.click_to_remove')}
                    >
                      <Check size={12} /> {t('plugins.installed')}
                    </button>
                  ) : (
                    <button
                      onClick={() => installPlugin(plugin.id)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                    >
                      {t('plugins.install')}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{t(plugin.descKey)}</p>
                {installed && !plugin.comingSoon && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    <span className="text-xs text-green-400">{t('plugins_view.active_hint')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-2">{t('plugins_view.usage_title')}</h3>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• <strong className="text-gray-400">{t('plugins.url_reader')}</strong>: {t('plugins_view.usage_url')}</li>
            <li>• <strong className="text-gray-400">{t('plugins_view.code_runner')}</strong>: {t('plugins_view.usage_code')}</li>
            <li>• <strong className="text-gray-400">{t('plugins.chart_render')}</strong>: {t('plugins_view.usage_chart')}</li>
            <li>• <strong className="text-gray-400">{t('plugins.web_search')}</strong>: {t('plugins_view.usage_search')}</li>
            <li>• <strong className="text-gray-400">{t('plugins.image_gen')}</strong>: {t('plugins_view.usage_image')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
