'use client';

import { useEffect, useState } from 'react';
import { useLicenseStore, type Plan } from '@/stores/license-store';

// orderId prefix에서 plan 추출 — billing-view-design1의 orderId 포맷:
// "blend-{plan}-{ts}-{rand}"  (plan: free | pro | lifetime)
function planFromOrderId(orderId?: string): Plan | null {
  if (!orderId) return null;
  const m = orderId.match(/^blend-(free|pro|lifetime)-/);
  if (!m) return null;
  return m[1] as Plan;
}

export default function PaymentSuccessClient() {
  const [info, setInfo] = useState<{ paymentKey?: string; orderId?: string; amount?: string }>({});
  const setLicense = useLicenseStore((s) => s.setLicense);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const next = {
      paymentKey: sp.get('paymentKey') ?? undefined,
      orderId:    sp.get('orderId')    ?? undefined,
      amount:     sp.get('amount')     ?? undefined,
    };
    setInfo(next);

    // [2026-04-26] F-2 — 임시 라이센스 활성화 (백엔드 검증은 후속 워커에서 정식 발급)
    const plan = planFromOrderId(next.orderId);
    if (plan && plan !== 'free') {
      const now = Date.now();
      const expiresAt = plan === 'pro' ? now + 1000 * 60 * 60 * 24 * 31 : undefined;
      setLicense({ plan, activatedAt: now, expiresAt, paymentKey: next.paymentKey, orderId: next.orderId });
    }
  }, [setLicense]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md p-8">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold text-green-400">결제 완료 / Payment Complete</h1>
        <p className="text-gray-400 text-sm">
          결제가 성공적으로 처리되었습니다. 영업일 기준 1일 이내 계정이 활성화됩니다.
        </p>
        <p className="text-gray-500 text-xs">
          Payment was processed successfully. Your account will be activated within 1 business day.
        </p>
        {info.orderId && (
          <div className="mt-4 rounded-lg bg-gray-900/60 px-4 py-3 text-left text-[11px] text-gray-400 break-all">
            <div><span className="text-gray-500">Order:</span> {info.orderId}</div>
            {info.amount     && <div><span className="text-gray-500">Amount:</span> ₩{info.amount}</div>}
            {info.paymentKey && <div><span className="text-gray-500">Key:</span> {info.paymentKey.slice(0, 24)}…</div>}
          </div>
        )}
        <a
          href="/"
          className="inline-block mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          Blend로 돌아가기 / Back to Blend
        </a>
      </div>
    </div>
  );
}
