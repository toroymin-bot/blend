'use client';

/**
 * D1AboutView — Design1 About view
 * "왜 만들었는지, 누가 만들었는지, 어디로 가는지."
 *
 * 정적 페이지. 컨셉 풀 텍스트.
 */

const tokens = {
  bg:           '#fafaf9',
  surface:      '#ffffff',
  text:         '#0a0a0a',
  textDim:      '#6b6862',
  textFaint:    '#a8a49b',
  accent:       '#c65a3c',
  border:       'rgba(10, 10, 10, 0.06)',
} as const;

const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || '2026-04-25';
const VERSION    = process.env.NEXT_PUBLIC_BUILD_VERSION || 'v0.9.x';

export default function D1AboutView({
  lang,
  onNavigate,
}: {
  lang: 'ko' | 'en';
  onNavigate?: (tab: string) => void;
}) {
  const isKo = lang === 'ko';

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: isKo ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <article className="mx-auto w-full max-w-[640px] px-6 py-16 md:py-24">

        {/* Logo + tagline */}
        <header className="mb-16 text-center">
          <div
            className="mb-3 text-[80px] leading-none"
            style={{ color: tokens.text, fontFamily: '"Instrument Serif", serif', fontWeight: 400 }}
          >
            B
          </div>
          <div className="text-[32px] md:text-[40px] font-medium tracking-tight">Blend</div>
          <p className="mt-5 text-[16px] md:text-[18px]" style={{ color: tokens.textDim }}>
            {isKo ? 'AI를 하나로, 더 싸게, 더 스마트하게.' : 'One AI app — cheaper and smarter.'}
          </p>
        </header>

        {isKo ? <SectionsKo /> : <SectionsEn />}

        <footer className="mt-16 pt-8 border-t text-center text-[12px]" style={{ borderColor: tokens.border, color: tokens.textFaint }}>
          {VERSION} · Build {BUILD_DATE}
        </footer>
      </article>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────

function SectionsKo() {
  return (
    <>
      <Section title="왜 만들었나">
        <P>
          ChatGPT, Claude, Gemini, Perplexity, Midjourney를 따로따로 구독하던 시대를 끝내고 싶었습니다. 매월 $90, 1년이면 $1,000.
        </P>
        <P>
          Blend는 모든 AI를 하나의 앱에서 사용하게 하면서, 직접 API 키로 쓴 만큼만 결제하는 방식을 채택했습니다. 평균 월 <Strong>$5</Strong> 수준입니다.
        </P>
        <P>
          추가로, 자동 매칭으로 어떤 AI를 쓸지 고민할 필요도 없습니다. 코딩은 Claude, 번역은 GPT mini가 알아서 처리합니다.
        </P>
      </Section>

      <Section title="어떻게 만들었나">
        <Bullets items={[
          'Next.js 정적 빌드 — 서버 없음',
          '모든 데이터는 사용자 기기에 — localStorage + IndexedDB',
          '5개 프로바이더 17+ 모델 직접 통합',
          '한국어 네이티브 — 번역이 아닌 한국어로 설계',
        ]} />
      </Section>

      <Section title="누가 만들었나">
        <P>
          ai4min.com에서 만들었습니다. <Strong>1인 + 1 AI 에이전트(꼬미)</Strong>의 협업.
        </P>
        <P>
          매일 새벽 1시, 꼬미가 자동으로 코드를 개선합니다.
        </P>
      </Section>

      <Section title="어디로 가나">
        <Bullets items={[
          'Tier 1 — 개인 (현재 단계)',
          'Tier 2 — 중소기업: NAS 연동, 팀 사용량 관리',
          'Tier 3 — 엔터프라이즈: 자체 호스팅, 완전 자체 인프라',
        ]} />
      </Section>

      <Section title="연락">
        <P>
          <a href="mailto:roy@ai4min.com" style={{ color: tokens.accent }}>📧 roy@ai4min.com</a>
        </P>
        <P>
          <a href="https://github.com/toroymin-bot/blend" target="_blank" rel="noopener noreferrer" style={{ color: tokens.accent }}>
            💬 github.com/toroymin-bot/blend
          </a>
        </P>
      </Section>
    </>
  );
}

function SectionsEn() {
  return (
    <>
      <Section title="Why we built this">
        <P>
          We wanted to end the era of stacking subscriptions for ChatGPT, Claude, Gemini, Perplexity, Midjourney. $90/month, $1,000+/year.
        </P>
        <P>
          Blend lets you use every AI from one app — paying per token with your own API keys, averaging <Strong>$5/month</Strong>.
        </P>
        <P>
          And with auto-routing, you don't have to think about which AI to use. Coding goes to Claude, translation to GPT mini, automatically.
        </P>
      </Section>

      <Section title="How it's built">
        <Bullets items={[
          'Next.js static build — no server',
          'All data on your device — localStorage + IndexedDB',
          '5 providers, 17+ models, directly integrated',
          'Korean-first — designed in Korean, not translated',
        ]} />
      </Section>

      <Section title="Who built this">
        <P>
          Built at ai4min.com. <Strong>One person plus one AI agent (Komi).</Strong>
        </P>
        <P>
          Every night at 1 AM KST, Komi auto-improves the codebase.
        </P>
      </Section>

      <Section title="Where it's going">
        <Bullets items={[
          'Tier 1 — Individuals (current)',
          'Tier 2 — Small teams: NAS integration, shared usage',
          'Tier 3 — Enterprise: self-hosted, full infrastructure control',
        ]} />
      </Section>

      <Section title="Contact">
        <P>
          <a href="mailto:roy@ai4min.com" style={{ color: tokens.accent }}>📧 roy@ai4min.com</a>
        </P>
        <P>
          <a href="https://github.com/toroymin-bot/blend" target="_blank" rel="noopener noreferrer" style={{ color: tokens.accent }}>
            💬 github.com/toroymin-bot/blend
          </a>
        </P>
      </Section>
    </>
  );
}

// ── Primitives ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2
        className="mb-5 text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: tokens.textFaint }}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[15px] md:text-[16px] leading-[1.7]"
      style={{ color: tokens.text }}
    >
      {children}
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium" style={{ color: tokens.text }}>
      {children}
    </span>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex items-baseline gap-2 text-[15px] leading-[1.7]" style={{ color: tokens.text }}>
          <span style={{ color: tokens.textFaint }}>•</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}
