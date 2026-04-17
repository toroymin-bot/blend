// [2026-04-18] Toss Payments fail redirect page
// Toss redirects here after failed/cancelled payment with ?code=&message=&orderId=

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function PaymentFailPage() {
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
