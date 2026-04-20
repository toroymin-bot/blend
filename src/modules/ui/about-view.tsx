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
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-7">
            {t('billing.hero_headline')}
          </h1>

          {/* $60 → $9 visual */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{t('billing.hero_vs_individual')}</p>
              <p className="text-3xl font-bold text-gray-500 line-through">$60</p>
            </div>
            <div className="text-3xl text-gray-600 font-light">→</div>
            <div className="text-center">
              <p className="text-xs text-blue-400 mb-1 uppercase tracking-wide">{t('billing.hero_vs_blend')}</p>
              <p className="text-5xl font-extrabold text-blue-400">$9</p>
            </div>
          </div>

          {/* Savings badges */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold">
              💰 $51 {t('billing.hero_savings_month')}
            </span>
            <span className="px-3 py-1.5 bg-green-500/10 text-green-500 rounded-full text-sm font-semibold">
              $612 {t('billing.hero_savings_year')}
            </span>
          </div>

          <p className="text-on-surface-muted text-base max-w-xl mx-auto">
            {t('about.hero_subtitle')}
          </p>
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
