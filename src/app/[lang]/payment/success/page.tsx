// [2026-04-18] Toss Payments success redirect page
// Toss redirects here after successful payment with ?paymentKey=&orderId=&amount=

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function PaymentSuccessPage() {
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
