'use client';

// [2026-04-17] Billing View — Subscription plans & payment methods
// Paddle Billing v2 overlay checkout: supports Korea + global, no backend required.

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settings-store';
import { startPaddleCheckout } from '@/lib/paddle';
// [2026-04-18] New: Toss Payments + Xendit integrations
import { openTossCheckout, isTossConfigured } from '@/lib/toss';
import { openXenditInvoice, isXenditConfigured } from '@/lib/xendit';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    descKey: 'Perfect for trying out Blend',
    features: ['10 messages/day', '3 AI models', 'Basic chat', 'Web search'],
    ctaKey: 'billing.get_started',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 9, yearly: 7 },
    descKey: 'For power users who want the best AI',
    features: ['Unlimited messages', 'All AI models', 'Voice chat', 'Image generation', 'Meeting analysis', 'Priority support'],
    ctaKey: 'billing.upgrade',
    highlighted: true,
  },
  // [2026-04-17] Team plan disabled — implement later
  // {
  //   id: 'team',
  //   name: 'Team',
  //   price: { monthly: 25, yearly: 20 },
  //   descKey: 'For teams collaborating with AI',
  //   features: ['Everything in Pro', 'Up to 10 members', 'Shared workspace', 'Admin dashboard', 'Custom AI agents', 'Dedicated support'],
  //   ctaKey: 'billing.contact_sales',
  //   highlighted: false,
  // },
];

const FAQ_KEYS = [
  { q: 'billing.faq_cancel_q', a: 'billing.faq_cancel_a' },
  { q: 'billing.faq_payment_q', a: 'billing.faq_payment_a' },
  { q: 'billing.faq_secure_q', a: 'billing.faq_secure_a' },
];

type PaymentTab = 'paddle' | 'toss' | 'xendit';

export function BillingView() {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const isKorean = settings.language === 'ko';

  const [yearly, setYearly] = useState(false);
  const defaultTab: PaymentTab = isKorean ? 'toss' : 'paddle';
  const [paymentTab, setPaymentTab] = useState<PaymentTab>(defaultTab);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  return (
    <div className="min-h-full bg-gray-950 text-white overflow-y-auto">
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

        {/* Plan Cards — 2 cols (Team disabled) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 border rounded-2xl p-7 flex flex-col ${
                plan.highlighted
                  ? 'border-blue-500 ring-2 ring-blue-500/30'
                  : 'border-gray-800'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {t('billing.most_popular')}
                  </span>
                </div>
              )}

              <div className="mb-5">
                <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
                <p className="text-gray-400 text-sm">{plan.descKey}</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold">
                  ${yearly ? plan.price.yearly : plan.price.monthly}
                </span>
                {plan.price.monthly > 0 && (
                  <span className="text-gray-400 text-sm ml-1">{t('billing.per_month')}</span>
                )}
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={15} className="text-green-400 mt-0.5 shrink-0" />
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {t(plan.ctaKey)}
              </button>
            </div>
          ))}
        </div>

        {/* Payment Method Selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
          <h3 className="text-base font-semibold mb-4">{t('billing.payment_method')}</h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            {(['paddle', 'toss', 'xendit'] as PaymentTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setPaymentTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  paymentTab === tab
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'paddle' && '💳 Paddle'}
                {tab === 'toss' && '🇰🇷 Toss Payments'}
                {tab === 'xendit' && '🇵🇭 Xendit'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {/* [2026-04-17] Stripe replaced with Paddle — supports Korea + global, no backend needed */}
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
          {/* [2026-04-18] Toss Payments — wired up to openTossCheckout */}
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
          {/* [2026-04-18] Xendit — wired up to openXenditInvoice (requires /api/xendit-invoice backend) */}
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
