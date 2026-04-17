// [2026-04-17] Privacy Policy page — required for Paddle merchant verification

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 17, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
        <p className="text-gray-700 leading-relaxed mb-3">We collect the following types of information:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li><strong>Account information:</strong> Email address when you sign up or contact us</li>
          <li><strong>Usage data:</strong> Anonymous usage statistics to improve the Service</li>
          <li><strong>Payment data:</strong> Handled entirely by Paddle — we never receive or store your card details</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Information We Do NOT Collect</h2>
        <ul className="list-disc list-inside text-gray-700 space-y-2">
          <li>Your API keys — stored locally in your browser only, never sent to our servers</li>
          <li>Your chat conversations — processed directly between your browser and AI providers</li>
          <li>Credit card or payment information — handled by Paddle</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
        <p className="text-gray-700 leading-relaxed">We use collected information to provide and improve the Service, process subscriptions, respond to support inquiries, and comply with legal obligations.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Third-Party Services</h2>
        <p className="text-gray-700 leading-relaxed mb-2">Blend integrates with the following third-party services:</p>
        <ul className="list-disc list-inside text-gray-700 space-y-1">
          <li><strong>Paddle</strong> — payment processing (paddle.com/privacy)</li>
          <li><strong>OpenAI, Google, Anthropic</strong> — AI model providers (your API key usage is governed by their respective privacy policies)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
        <p className="text-gray-700 leading-relaxed">We implement industry-standard security measures. However, no method of transmission over the internet is 100% secure. Your API keys are stored only in your browser's local storage and are never transmitted to our servers.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
        <p className="text-gray-700 leading-relaxed">You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <a href="mailto:toroymin@gmail.com" className="text-blue-600 underline">toroymin@gmail.com</a>.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Cookies</h2>
        <p className="text-gray-700 leading-relaxed">Blend uses minimal cookies and browser local storage to save your settings and preferences. We do not use advertising or tracking cookies.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
        <p className="text-gray-700 leading-relaxed">For privacy inquiries, contact: <a href="mailto:toroymin@gmail.com" className="text-blue-600 underline">toroymin@gmail.com</a></p>
      </section>
    </div>
  );
}
