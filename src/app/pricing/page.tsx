// [2026-04-17] Pricing page — public-facing, required for Paddle merchant verification

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white px-6 py-16 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-400 text-lg">Start for free. Upgrade when you need more.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Free */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col">
          <h2 className="text-2xl font-bold mb-1">Free</h2>
          <p className="text-gray-400 text-sm mb-6">Perfect for trying out Blend</p>
          <div className="mb-6">
            <span className="text-5xl font-bold">$0</span>
          </div>
          <ul className="space-y-3 mb-8 flex-1 text-sm text-gray-300">
            <li>✓ 10 messages / day</li>
            <li>✓ 3 AI models</li>
            <li>✓ Basic chat</li>
            <li>✓ Web search</li>
          </ul>
          <a href="/" className="block text-center py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors">
            Get started free
          </a>
        </div>

        {/* Pro */}
        <div className="relative bg-gray-900 border-2 border-blue-500 rounded-2xl p-8 flex flex-col ring-2 ring-blue-500/20">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Pro</h2>
          <p className="text-gray-400 text-sm mb-6">For power users who want the best AI</p>
          <div className="mb-1">
            <span className="text-5xl font-bold">$9</span>
            <span className="text-gray-400 text-sm ml-1">/ month</span>
          </div>
          <p className="text-green-400 text-sm mb-6">$84/year — save 22% with annual billing</p>
          <ul className="space-y-3 mb-8 flex-1 text-sm text-gray-300">
            <li>✓ Unlimited messages</li>
            <li>✓ All AI models (GPT-4, Claude, Gemini…)</li>
            <li>✓ Voice chat</li>
            <li>✓ Image generation</li>
            <li>✓ Meeting analysis</li>
            <li>✓ Priority support</li>
          </ul>
          <a href="/" className="block text-center py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            Upgrade to Pro
          </a>
        </div>
      </div>

      <div className="text-center mt-12 text-sm text-gray-500">
        <p>All plans include a 30-day money-back guarantee. Payments processed by <a href="https://paddle.com" className="text-gray-400 underline">Paddle</a>.</p>
        <p className="mt-2">Questions? <a href="mailto:toroymin@gmail.com" className="text-gray-400 underline">toroymin@gmail.com</a></p>
      </div>
    </div>
  );
}
