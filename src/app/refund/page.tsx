// [2026-04-17] Refund Policy page — required for Paddle merchant verification

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 17, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">30-Day Money-Back Guarantee</h2>
        <p className="text-gray-700 leading-relaxed">We offer a <strong>30-day money-back guarantee</strong> for all new Pro subscriptions. If you are not satisfied with Blend within the first 30 days of your paid subscription, contact us for a full refund — no questions asked.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How to Request a Refund</h2>
        <p className="text-gray-700 leading-relaxed mb-3">To request a refund:</p>
        <ol className="list-decimal list-inside text-gray-700 space-y-2">
          <li>Email us at <a href="mailto:blend@ai4min.com" className="text-blue-600 underline">blend@ai4min.com</a></li>
          <li>Include your subscription email address and reason for the refund</li>
          <li>We will process your refund within 5–10 business days</li>
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Cancellations</h2>
        <p className="text-gray-700 leading-relaxed">You may cancel your subscription at any time. After cancellation, you retain access to Pro features until the end of your current billing period. No partial refunds are issued for unused time after the 30-day guarantee period.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Exceptions</h2>
        <p className="text-gray-700 leading-relaxed">Refunds are not available for accounts that have violated our Terms of Service. Refund requests after 30 days are evaluated on a case-by-case basis.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Payment Processing</h2>
        <p className="text-gray-700 leading-relaxed">All payments and refunds are processed by Paddle.com, our Merchant of Record. Refunds will be credited to your original payment method. Processing time may vary depending on your bank or card issuer.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-700 leading-relaxed">For refund requests or questions: <a href="mailto:blend@ai4min.com" className="text-blue-600 underline">blend@ai4min.com</a></p>
      </section>
    </div>
  );
}
