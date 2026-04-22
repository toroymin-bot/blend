'use client';

import { useTranslation } from '@/lib/i18n';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AboutViewProps {
  onNavigate: (tab: string) => void;
}

export function AboutView({ onNavigate }: AboutViewProps) {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const cards = [
    { emoji: '📡', titleKey: 'about.card1_title', bodyKey: 'about.card1_body' },
    { emoji: '🔑', titleKey: 'about.card2_title', bodyKey: 'about.card2_body' },
    { emoji: '💰', titleKey: 'about.card3_title', bodyKey: 'about.card3_body' },
  ];

  const faqs = [
    { q: 'about.faq1_q', a: 'about.faq1_a' },
    { q: 'about.faq2_q', a: 'about.faq2_a' },
  ];

  const compareRows = [
    { service: 'ChatGPT Plus', individual: '$20/mo', blend: '✓' },
    { service: 'Claude Pro',   individual: '$20/mo', blend: '✓' },
    { service: 'Gemini Adv',   individual: '$19.99/mo', blend: '✓' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl mx-auto">

        {/* Hero — savings-first */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
            {t('billing.hero_headline')}
          </h1>
          <p className="text-on-surface-muted text-base max-w-xl mx-auto mb-6 leading-relaxed">
            {t('billing.hero_sub')}
          </p>
        </div>

        {/* Why section — subscription trap logic */}
        <div className="mb-10 bg-surface-2 rounded-2xl overflow-hidden border border-gray-700/50">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-700/50">
            <h2 className="text-base font-bold text-on-surface mb-1">{t('about.why_title')}</h2>
            <p className="text-2xl font-extrabold text-yellow-400">{t('about.why_hook')}</p>
            <p className="text-sm text-on-surface-muted mt-1.5">{t('about.why_hook_sub')}</p>
          </div>

          {/* Per-AI breakdown */}
          <div className="px-6 py-5">
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { name: 'ChatGPT', sub: '$20', actual: '$5', waste: '$15' },
                { name: 'Claude',  sub: '$20', actual: '$5', waste: '$15' },
                { name: 'Gemini',  sub: '$19.99', actual: '$5', waste: '$14.99' },
              ].map((ai) => (
                <div key={ai.name} className="bg-gray-800/60 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-on-surface-muted mb-2">{ai.name}</p>
                  <p className="text-lg font-bold text-red-400 line-through opacity-70">{ai.sub}</p>
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs text-green-400">
                      {t('about.why_actual_label')} <span className="font-bold">{ai.actual}</span>
                    </p>
                    <p className="text-xs text-red-400/80">
                      {t('about.why_waste_label')} <span className="font-bold">{ai.waste}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Before / After total */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-xs text-red-400 font-semibold mb-1 uppercase tracking-wide">{t('about.why_compare_sub')}</p>
                <p className="text-2xl font-extrabold text-red-400">$60<span className="text-sm font-normal text-red-400/60">/mo</span></p>
                <p className="text-xs text-red-400/60 mt-1">{t('about.why_sub_breakdown')}</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="text-xs text-blue-400 font-semibold mb-1 uppercase tracking-wide">{t('about.why_compare_blend')}</p>
                <p className="text-2xl font-extrabold text-blue-400">~$24<span className="text-sm font-normal text-blue-400/60">/mo</span></p>
                <p className="text-xs text-blue-400/60 mt-1">API $15 + Blend $9</p>
              </div>
            </div>

            {/* Conclusion */}
            <div className="rounded-xl bg-gray-800/40 border border-gray-700/40 p-4">
              <p className="text-sm font-semibold text-on-surface mb-1">💡 {t('about.why_api_title')}</p>
              <p className="text-xs text-on-surface-muted leading-relaxed">{t('about.why_api_body')}</p>
            </div>
          </div>

          {/* Footer note */}
          <div className="px-6 pb-4">
            <p className="text-xs text-gray-600">{t('about.why_note')}</p>
          </div>
        </div>

        {/* 3 explanation cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {cards.map((card) => (
            <div key={card.titleKey} className="bg-surface-2 rounded-2xl p-5">
              <div className="text-3xl mb-3">{card.emoji}</div>
              <h3 className="text-sm font-semibold text-on-surface mb-2">{t(card.titleKey)}</h3>
              <p className="text-xs text-on-surface-muted leading-relaxed">{t(card.bodyKey)}</p>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="bg-surface-2 rounded-2xl p-6 mb-10">
          <h2 className="text-base font-semibold text-on-surface mb-4">{t('about.compare_title')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-on-surface-muted text-xs uppercase tracking-wider border-b border-gray-700">
                <th className="text-left pb-2">Service</th>
                <th className="text-right pb-2">Individual</th>
                <th className="text-right pb-2">Blend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {compareRows.map((row) => (
                <tr key={row.service}>
                  <td className="py-2.5 text-on-surface">{row.service}</td>
                  <td className="py-2.5 text-right text-red-300">{row.individual}</td>
                  <td className="py-2.5 text-right text-green-400 font-semibold">{row.blend}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-3 text-on-surface">Total</td>
                <td className="pt-3 text-right text-red-400 text-base">$60+/mo</td>
                <td className="pt-3 text-right text-blue-400 text-base">$9/mo + API</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-base font-semibold text-on-surface mb-4">{t('about.faq_title')}</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-surface-2 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left text-sm font-medium text-on-surface hover:text-blue-300 transition-colors"
                >
                  {t(faq.q)}
                  {openFaq === i
                    ? <ChevronUp size={16} className="shrink-0 text-on-surface-muted" />
                    : <ChevronDown size={16} className="shrink-0 text-on-surface-muted" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-on-surface-muted">{t(faq.a)}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={() => onNavigate('billing')}
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {t('billing.hero_cta')} →
          </button>
          <button
            onClick={() => onNavigate('chat')}
            className="w-full sm:w-auto px-8 py-3.5 bg-surface-2 hover:bg-gray-700 text-on-surface rounded-xl font-semibold text-sm transition-colors border border-gray-700"
          >
            {t('about.cta_chat')}
          </button>
        </div>

      </div>
    </div>
  );
}
