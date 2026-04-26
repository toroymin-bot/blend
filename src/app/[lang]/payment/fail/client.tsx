'use client';

import { useEffect, useState } from 'react';

export default function PaymentFailClient() {
  const [info, setInfo] = useState<{ code?: string; message?: string; orderId?: string }>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setInfo({
      code:    sp.get('code')    ?? undefined,
      message: sp.get('message') ?? undefined,
      orderId: sp.get('orderId') ?? undefined,
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md p-8">
        <div className="text-5xl">❌</div>
        <h1 className="text-2xl font-bold text-red-400">결제 실패 / Payment Failed</h1>
        <p className="text-gray-400 text-sm">
          결제가 완료되지 않았습니다. 다시 시도하거나 다른 결제 수단을 선택해주세요.
        </p>
        <p className="text-gray-500 text-xs">
          Payment was not completed. Please try again or choose a different payment method.
        </p>
        {(info.code || info.message) && (
          <div className="mt-4 rounded-lg bg-gray-900/60 px-4 py-3 text-left text-[11px] text-gray-400 break-all">
            {info.code    && <div><span className="text-gray-500">Code:</span> {info.code}</div>}
            {info.message && <div><span className="text-gray-500">Message:</span> {info.message}</div>}
            {info.orderId && <div><span className="text-gray-500">Order:</span> {info.orderId}</div>}
          </div>
        )}
        <a
          href="/"
          className="inline-block mt-4 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          돌아가기 / Go Back
        </a>
      </div>
    </div>
  );
}
