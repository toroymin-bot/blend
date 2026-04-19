'use client';

// [2026-04-17] Billing View — Subscription plans & payment methods
// [2026-04-19] Added: Lifetime plan, country-based tab highlight, dual currency, BYOK notice

import { useState, useRef } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settings-store';
import { startPaddleCheckout } from '@/lib/paddle';
import { openTossCheckout, isTossConfigured } from '@/lib/toss';
import { openXenditInvoice, isXenditConfigured } from '@/lib/xendit';
import { useCountry } from '@/lib/use-country';

const KRW = 1380;
const PHP = 56;

function formatDual(usd: number, country: string): string {
  if (country === 'KR') return `$${usd.toFixed(1)} (₩${Math.round(usd * KRW).toLocaleString()})`;
  if (country === 'PH') return `$${usd.toFixed(1)} (₱${Math.round(usd * PHP).toLocaleString()})`;
  return `$${usd.toFixed(1)}`;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    descKey: 'billing.plan_free_subtitle',
    features: [
      { textKey: '10 messages/day' },
      { textKey: '3 AI models' },
      { textKey: 'Basic chat' },
      { textKey: 'Web search' },
    ],
    ctaKey: 'billing.get_started',
    highlighted: false,
    isLifetime: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 9, yearly: 7 },
    descKey: 'billing.plan_pro_subtitle',
    features: [
      { textKey: 'billing.feature_unlimited_msg' },
      { textKey: 'billing.feature_all_models' },
      { textKey: 'billing.feature_voice_chat',  accent: true },
      { textKey: 'billing.feature_image_gen',   accent: true },
      { textKey: 'billing.feature_meeting',     accent: true },
      { textKey: 'billing.feature_priority_support' },
    ],
    ctaKey: 'billing.upgrade',
    highlighted: true,
    isLifetime: false,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: { monthly: 29, yearly: 29 },
    descKey: 'billing.lifetime_desc',
    features: [
      { textKey: 'billing.feature_all_in_pro' },
      { textKey: 'billing.feature_future_updates' },
      { textKey: 'billing.feature_unlimited_msg' },
      { textKey: 'billing.feature_all_models' },
      { textKey: 'billing.feature_voice_chat',  accent: true },
      { textKey: 'billing.feature_image_gen',   accent: true },
      { textKey: 'billing.feature_meeting',     accent: true },
      { textKey: 'billing.feature_priority_support' },
    ],
    ctaKey: 'billing.lifetime_cta',
    highlighted: false,
    isLifetime: true,
  },
];

const FAQ_KEYS = [
  { q: 'billing.faq_benefits_q', a: 'billing.faq_benefits_a' },
  { q: 'billing.faq_cancel_q', a: 'billing.faq_cancel_a' },
  { q: 'billing.faq_payment_q', a: 'billing.faq_payment_a' },
  { q: 'billing.faq_secure_q', a: 'billing.faq_secure_a' },
];

type PaymentTab = 'paddle' | 'toss' | 'xendit';

function isRecommendedTab(tab: PaymentTab, country: string): boolean {
  if (country === 'KR') return tab === 'paddle' || tab === 'toss';
  if (country === 'PH') return tab === 'xendit';
  return tab === 'paddle';
}

export function BillingView() {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const { country, loading: countryLoading } = useCountry();
  const isKorean = settings.language === 'ko';

  const [yearly, setYearly] = useState(false);
  const defaultTab: PaymentTab = isKorean ? 'toss' : 'paddle';
  const [paymentTab, setPaymentTab] = useState<PaymentTab>(defaultTab);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const paymentRef = useRef<HTMLDivElement>(null);

  const tabLabel = (tab: PaymentTab): string => {
    if (tab === 'paddle') return `💳 ${t('billing.tab_card')}`;
    if (tab === 'toss')   return `🇰🇷 ${t('billing.tab_toss')}`;
    return `🇵🇭 ${t('billing.tab_xendit')}`;
  };

  return (
    <div className="h-full bg-gray-950 text-white overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">{t('billing.title')}</h1>
          <p className="text-gray-400 mb-6">{t('billing.subtitle')}</p>

          {/* Monthly / Yearly toggle */}
          <div className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !yearly ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('billing.monthly')}
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                yearly ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('billing.yearly')}
              <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full">{t('billing.save_badge')}</span>
            </button>
          </div>
        </div>

        {/* Plan Cards — 3 cols */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          {PLANS.map((plan) => {
            const price = yearly ? plan.price.yearly : plan.price.monthly;
            const cardContent = (
              <>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {t('billing.most_popular')}
                    </span>
                  </div>
                )}
                {plan.isLifetime && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                      {t('billing.lifetime_badge')}
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
                  <p className="text-gray-400 text-sm">{t(plan.descKey)}</p>
                </div>

                <div className="mb-2">
                  <span className="text-5xl font-bold">
                    {countryLoading ? `$${price}` : formatDual(price, country)}
                  </span>
                  {!plan.isLifetime && plan.price.monthly > 0 && (
                    <span className="text-gray-400 text-sm ml-1">{t('billing.per_month')}</span>
                  )}
                  {plan.isLifetime && (
                    <span className="text-gray-400 text-sm ml-1">{t('billing.label_one_time')}</span>
                  )}
                </div>

                {plan.isLifetime && (
                  <>
                    <p className="text-gray-400 text-xs mb-4">✓ {t('billing.lifetime_oneshot')}</p>
                  </>
                )}

                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f) => {
                    const label = f.textKey.startsWith('billing.') ? t(f.textKey) : f.textKey;
                    return (
                      <li key={f.textKey} className="flex items-start gap-2 text-sm">
                        <Check size={15} className={`mt-0.5 shrink-0 ${f.accent ? 'text-yellow-400' : 'text-green-400'}`} />
                        <span className={f.accent ? 'text-yellow-300 font-medium' : 'text-gray-300'}>{label}</span>
                      </li>
                    );
                  })}
                </ul>

                <button
                  onClick={() => paymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.isLifetime
                      ? 'bg-amber-500 hover:bg-amber-400 text-black'
                      : plan.highlighted
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {t(plan.ctaKey)}
                </button>

                {plan.isLifetime && (
                  <p className="text-xs text-gray-500 text-center mt-2">{t('billing.lifetime_after')}</p>
                )}
              </>
            );

            if (plan.isLifetime) {
              return (
                <div key={plan.id} className="p-[1px] rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 shadow-[0_0_24px_rgba(251,191,36,0.2)] relative">
                  <div className="bg-gray-900 rounded-2xl p-7 flex flex-col h-full relative">
                    {cardContent}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={plan.id}
                className={`relative bg-gray-900 border rounded-2xl p-7 flex flex-col ${
                  plan.highlighted
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-gray-800'
                }`}
              >
                {cardContent}
              </div>
            );
          })}
        </div>

        {/* BYOK notice */}
        <p className="text-base font-semibold text-amber-400 text-center mb-8">
          🔑 Blend는 내 API 키로 직접 연결해요. API 비용은 각 서비스에 별도 청구되며, 평균 월 $5 수준이에요.
        </p>

        {/* Payment Method Selection */}
        <div ref={paymentRef} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
          <h3 className="text-base font-semibold mb-4">{t('billing.payment_method')}</h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(['paddle', 'toss', 'xendit'] as PaymentTab[]).map((tab) => {
              const recommended = !countryLoading && isRecommendedTab(tab, country);
              return (
                <button
                  key={tab}
                  onClick={() => setPaymentTab(tab)}
                  className={`relative px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    paymentTab === tab
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : recommended
                      ? 'bg-gray-800 border-yellow-500/60 text-gray-300 hover:text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {tabLabel(tab)}
                  {recommended && (
                    <span className="absolute -top-2 -right-1 bg-yellow-500 text-black text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
                      {t('billing.tab_recommended')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {paymentTab === 'paddle' && (
            <div className="text-sm text-gray-400 space-y-2">
              <p>Pay with card — Paddle supports Korea &amp; worldwide (200+ countries).</p>
              <p className="text-xs text-gray-500">VAT &amp; tax handled automatically by Paddle.</p>
              <button
                onClick={() => {
                  const priceId = yearly
                    ? process.env.NEXT_PUBLIC_PADDLE_PRO_YEARLY_PRICE_ID
                    : process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID;
                  if (priceId) startPaddleCheckout(priceId);
                }}
                disabled={!process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID}
                className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID
                    ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID
                  ? 'Pay with Card →'
                  : 'Setup required — see Confluence'}
              </button>
            </div>
          )}
          {paymentTab === 'toss' && (
            <div className="text-sm text-gray-400 space-y-2">
              <p>토스페이먼츠로 결제 — 토스페이, 카카오페이, 네이버페이, 카드 지원.</p>
              {paymentError && paymentTab === 'toss' && (
                <p className="text-red-400 text-xs">{paymentError}</p>
              )}
              <button
                onClick={async () => {
                  if (!isTossConfigured()) { setPaymentError('Setup required — NEXT_PUBLIC_TOSS_CLIENT_KEY not set. See Confluence.'); return; }
                  setPaymentLoading(true); setPaymentError('');
                  try {
                    const price = yearly ? 7 : 9;
                    await openTossCheckout({
                      amount: price * 1000,
                      orderId: `blend-pro-${Date.now()}`,
                      orderName: `Blend Pro (${yearly ? 'Yearly' : 'Monthly'})`,
                    });
                  } catch (e) {
                    setPaymentError(e instanceof Error ? e.message : '결제 오류가 발생했습니다.');
                  } finally { setPaymentLoading(false); }
                }}
                disabled={paymentLoading}
                className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {paymentLoading ? '처리 중...' : '토스페이먼츠로 결제 →'}
              </button>
            </div>
          )}
          {paymentTab === 'xendit' && (
            <div className="text-sm text-gray-400 space-y-2">
              <p>Pay via Xendit — GCash, Maya, credit/debit card for Philippines &amp; SE Asia.</p>
              <p className="text-xs text-gray-500">Malaysia: Touch &apos;n Go, GrabPay, FPX also supported.</p>
              {paymentError && paymentTab === 'xendit' && (
                <p className="text-red-400 text-xs">{paymentError}</p>
              )}
              <button
                onClick={async () => {
                  if (!isXenditConfigured()) { setPaymentError('Setup required — NEXT_PUBLIC_XENDIT_PUBLIC_KEY not set. See Confluence.'); return; }
                  setPaymentLoading(true); setPaymentError('');
                  try {
                    const price = yearly ? 350 : 450;
                    await openXenditInvoice({
                      amount: price,
                      currency: 'PHP',
                      description: `Blend Pro (${yearly ? 'Yearly' : 'Monthly'})`,
                    });
                  } catch (e) {
                    setPaymentError(e instanceof Error ? e.message : 'Payment error. Please try again.');
                  } finally { setPaymentLoading(false); }
                }}
                disabled={paymentLoading}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {paymentLoading ? 'Processing...' : 'Continue with Xendit →'}
              </button>
            </div>
          )}
        </div>

        {/* FAQ */}
        <div>
          <h3 className="text-base font-semibold mb-4">{t('billing.faq_title')}</h3>
          <div className="space-y-2">
            {FAQ_KEYS.map((faq, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left text-sm font-medium text-gray-200 hover:text-white transition-colors"
                >
                  {t(faq.q)}
                  {openFaq === i ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-400">{t(faq.a)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
