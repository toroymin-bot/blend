// [2026-04-17] Terms of Service page — required for Paddle merchant verification

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 17, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
        <p className="text-gray-700 leading-relaxed">By accessing or using Blend ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
        <p className="text-gray-700 leading-relaxed">Blend is a SaaS web application that provides a unified interface for accessing multiple AI models including GPT-4, Claude, Gemini, and others. Features include text chat, voice input, image generation, and meeting analysis.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Subscription Plans</h2>
        <p className="text-gray-700 leading-relaxed mb-2">Blend offers the following plans:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-1">
          <li><strong>Free:</strong> 10 messages/day, 3 AI models, basic features</li>
          <li><strong>Pro Monthly:</strong> $9.00/month — unlimited messages, all AI models, all features</li>
          <li><strong>Pro Yearly:</strong> $84.00/year ($7.00/month) — all Pro features, billed annually</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Payment</h2>
        <p className="text-gray-700 leading-relaxed">Payments are processed by Paddle.com, our Merchant of Record. Paddle handles billing, VAT, and tax on our behalf. By subscribing, you agree to Paddle's terms of service available at paddle.com/legal.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. API Keys</h2>
        <p className="text-gray-700 leading-relaxed">Blend allows users to connect their own API keys from AI providers (OpenAI, Google, Anthropic, etc.). These keys are stored locally in your browser and are never transmitted to our servers. You are responsible for the usage and costs associated with your own API keys.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Prohibited Use</h2>
        <p className="text-gray-700 leading-relaxed">You may not use Blend to generate illegal content, violate third-party rights, attempt to reverse-engineer the Service, or engage in any activity that violates applicable laws.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Disclaimer</h2>
        <p className="text-gray-700 leading-relaxed">The Service is provided "as is" without warranties of any kind. We do not guarantee continuous availability or accuracy of AI-generated content. AI outputs should be verified before use in critical applications.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Changes to Terms</h2>
        <p className="text-gray-700 leading-relaxed">We reserve the right to update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
        <p className="text-gray-700 leading-relaxed">For questions about these Terms, contact us at: <a href="mailto:toroymin@gmail.com" className="text-blue-600 underline">toroymin@gmail.com</a></p>
      </section>
    </div>
  );
}
