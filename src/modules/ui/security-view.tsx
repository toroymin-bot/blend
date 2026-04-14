'use client';

import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

type Level = 'safe' | 'info' | 'caution';

interface QA {
  qKey: string;
  aKey: string;
  level: Level;
  emoji: string;
}

interface Category {
  id: string;
  emoji: string;
  titleKey: string;
  subtitleKey: string;
  color: string;
  borderColor: string;
  items: QA[];
}

const CATEGORIES: Category[] = [
  {
    id: 'chat',
    emoji: '💬',
    titleKey: 'security_view.cat_chat_title',
    subtitleKey: 'security_view.cat_chat_subtitle',
    color: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    items: [
      { emoji: '📱', qKey: 'security_view.cat_chat_q1', aKey: 'security_view.cat_chat_a1', level: 'safe' },
      { emoji: '🔄', qKey: 'security_view.cat_chat_q2', aKey: 'security_view.cat_chat_a2', level: 'safe' },
      { emoji: '🗑', qKey: 'security_view.cat_chat_q3', aKey: 'security_view.cat_chat_a3', level: 'info' },
      { emoji: '🌐', qKey: 'security_view.cat_chat_q4', aKey: 'security_view.cat_chat_a4', level: 'safe' },
    ],
  },
  {
    id: 'docs',
    emoji: '📁',
    titleKey: 'security_view.cat_docs_title',
    subtitleKey: 'security_view.cat_docs_subtitle',
    color: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    items: [
      { emoji: '📂', qKey: 'security_view.cat_docs_q1', aKey: 'security_view.cat_docs_a1', level: 'safe' },
      { emoji: '🔍', qKey: 'security_view.cat_docs_q2', aKey: 'security_view.cat_docs_a2', level: 'safe' },
      { emoji: '☁️', qKey: 'security_view.cat_docs_q3', aKey: 'security_view.cat_docs_a3', level: 'safe' },
      { emoji: '🔑', qKey: 'security_view.cat_docs_q4', aKey: 'security_view.cat_docs_a4', level: 'safe' },
    ],
  },
  {
    id: 'apikey',
    emoji: '🗝️',
    titleKey: 'security_view.cat_apikey_title',
    subtitleKey: 'security_view.cat_apikey_subtitle',
    color: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    items: [
      { emoji: '🔐', qKey: 'security_view.cat_apikey_q1', aKey: 'security_view.cat_apikey_a1', level: 'info' },
      { emoji: '🚫', qKey: 'security_view.cat_apikey_q2', aKey: 'security_view.cat_apikey_a2', level: 'safe' },
      { emoji: '🔄', qKey: 'security_view.cat_apikey_q3', aKey: 'security_view.cat_apikey_a3', level: 'caution' },
    ],
  },
  {
    id: 'network',
    emoji: '🌐',
    titleKey: 'security_view.cat_network_title',
    subtitleKey: 'security_view.cat_network_subtitle',
    color: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    items: [
      { emoji: '🔒', qKey: 'security_view.cat_network_q1', aKey: 'security_view.cat_network_a1', level: 'safe' },
      { emoji: '📡', qKey: 'security_view.cat_network_q2', aKey: 'security_view.cat_network_a2', level: 'caution' },
      { emoji: '🛰', qKey: 'security_view.cat_network_q3', aKey: 'security_view.cat_network_a3', level: 'safe' },
    ],
  },
  {
    id: 'server',
    emoji: '🖥',
    titleKey: 'security_view.cat_server_title',
    subtitleKey: 'security_view.cat_server_subtitle',
    color: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    items: [
      { emoji: '🏗', qKey: 'security_view.cat_server_q1', aKey: 'security_view.cat_server_a1', level: 'safe' },
      { emoji: '🔄', qKey: 'security_view.cat_server_q2', aKey: 'security_view.cat_server_a2', level: 'safe' },
      { emoji: '🔐', qKey: 'security_view.cat_server_q3', aKey: 'security_view.cat_server_a3', level: 'info' },
      { emoji: '📋', qKey: 'security_view.cat_server_q4', aKey: 'security_view.cat_server_a4', level: 'info' },
    ],
  },
  {
    id: 'device',
    emoji: '📱',
    titleKey: 'security_view.cat_device_title',
    subtitleKey: 'security_view.cat_device_subtitle',
    color: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    items: [
      { emoji: '👀', qKey: 'security_view.cat_device_q1', aKey: 'security_view.cat_device_a1', level: 'caution' },
      { emoji: '🔓', qKey: 'security_view.cat_device_q2', aKey: 'security_view.cat_device_a2', level: 'caution' },
      { emoji: '🧹', qKey: 'security_view.cat_device_q3', aKey: 'security_view.cat_device_a3', level: 'info' },
    ],
  },
];

function LevelBadge({ level }: { level: Level }) {
  const { t } = useTranslation();
  if (level === 'safe') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <CheckCircle2 size={10} /> {t('security_view.level_safe')}
    </span>
  );
  if (level === 'caution') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <AlertTriangle size={10} /> {t('security_view.level_caution')}
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full shrink-0">
      <Info size={10} /> {t('security_view.level_info')}
    </span>
  );
}

function QACard({ item }: { item: QA }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left bg-gray-800/60 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-xl shrink-0 mt-0.5">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-200 leading-snug">{t(item.qKey)}</p>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <LevelBadge level={item.level} />
              {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-0">
          <div className={`ml-9 text-sm text-gray-300 leading-relaxed rounded-lg p-3 ${
            item.level === 'safe' ? 'bg-green-900/20 border border-green-700/30' :
            item.level === 'caution' ? 'bg-yellow-900/20 border border-yellow-700/30' :
            'bg-blue-900/20 border border-blue-700/30'
          }`}>
            {t(item.aKey)}
          </div>
        </div>
      )}
    </button>
  );
}

function CategorySection({ cat }: { cat: Category }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-2xl border ${cat.borderColor} ${cat.color} overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-4 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {cat.emoji} {t(cat.titleKey)}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{t(cat.subtitleKey)}</p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {cat.items.map((item, i) => <QACard key={i} item={item} />)}
        </div>
      )}
    </div>
  );
}

export function SecurityView() {
  const { t } = useTranslation();
  const safeCount = CATEGORIES.flatMap((c) => c.items).filter((i) => i.level === 'safe').length;
  const totalCount = CATEGORIES.flatMap((c) => c.items).length;

  return (
    <div className="h-full overflow-y-auto bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <Shield size={20} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{t('security_view.page_title')}</h1>
              <p className="text-xs text-gray-400">{t('security_view.page_subtitle')}</p>
            </div>
          </div>

          {/* Overall score banner */}
          <div className="mt-4 bg-green-900/20 border border-green-700/30 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="text-4xl">🛡️</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-300">{t('security_view.safe_count', { safe: safeCount, total: totalCount })}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('security_view.summary_desc')}
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 size={12} /> <span>{t('security_view.legend_safe')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-blue-400">
              <Info size={12} /> <span>{t('security_view.legend_info')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <AlertTriangle size={12} /> <span>{t('security_view.legend_caution')}</span>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-4">
          {CATEGORIES.map((cat) => (
            <CategorySection key={cat.id} cat={cat} />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-6 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-400 mb-1">📌 {t('security_view.footer_title')}</p>
          <p>• <span className="text-green-400 font-medium">{t('security_view.footer_1')}</span></p>
          <p>• {t('security_view.footer_2')}</p>
          <p>• {t('security_view.footer_3')}</p>
          <p>• {t('security_view.footer_4')}</p>
        </div>

      </div>
    </div>
  );
}
