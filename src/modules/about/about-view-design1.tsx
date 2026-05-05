'use client';

/**
 * D1AboutView — Design1 About view (compressed Jobs-style copy, v1 final)
 * 4 sections only: Why we built / Made by / Contact / Version
 */

const tokens = {
  bg:        'var(--d1-bg)',
  text:      'var(--d1-text)',
  textDim:   'var(--d1-text-dim)',
  textFaint: 'var(--d1-text-faint)',
  accent:    'var(--d1-accent)',
  border:    'var(--d1-border)',
} as const;

const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || '2026-04-25';
const VERSION    = process.env.NEXT_PUBLIC_BUILD_VERSION || 'v0.9.x';

export default function D1AboutView({ lang }: { lang: 'ko' | 'en' | 'ph'; onNavigate?: (tab: string) => void }) {
  const isKo = lang === 'ko';
  const isPh = lang === 'ph';

  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        background: tokens.bg,
        color: tokens.text,
        fontFamily: isKo ? 'Pretendard, sans-serif' : 'Geist, sans-serif',
      }}
    >
      <article className="mx-auto w-full max-w-[560px] px-6 py-16 md:py-24">

        {/* Logo + tagline */}
        <header className="mb-16 text-center">
          <div
            aria-hidden="true"
            className="mb-3 text-[80px] leading-none"
            style={{
              color: tokens.text,
              fontFamily: '"Instrument Serif", serif',
              fontWeight: 400,
            }}
          >
            B
          </div>
          <h1 className="text-[32px] md:text-[40px] font-medium tracking-tight">Blend</h1>
          {/* [2026-05-05 Roy PM-29] tagline 변경 — "한 달에 커피 한 잔. 매일 모든 AI를." */}
          <p className="mt-5 text-[16px] md:text-[18px]" style={{ color: tokens.textDim }}>
            {isKo
              ? '한 달에 커피 한 잔. 매일 모든 AI를.'
              : isPh
              ? 'Isang kape kada buwan. Lahat ng AI araw-araw.'
              : 'One coffee a month. Every AI, every day.'}
          </p>
        </header>

        {/* Why we built this */}
        {/* [2026-05-05 Roy PM-29] 가격 카피 변경 — "원가로 이용 / $60 → 평균 $5" */}
        <Section title={isKo ? '왜 만들었나' : isPh ? 'Bakit ginawa namin ito' : 'Why we built this'}>
          {isKo ? (
            <>
              <P>매일 모든 AI를. 쓴 만큼만 내세요.</P>
              <P>블렌드의 멤버로서 Claude + ChatGPT + Gemini의 API를 원가로 이용하세요.</P>
              <P>이제 매달 $60 대신 평균 $5.</P>
              <PStrong>이게 Blend입니다.</PStrong>
            </>
          ) : isPh ? (
            <>
              <P>Lahat ng AI araw-araw. Bayaran lamang ang ginagamit.</P>
              <P>Bilang miyembro ng Blend, gamitin ang API ng Claude + ChatGPT + Gemini sa presyo lang.</P>
              <P>Ngayon, sa halip na $60 kada buwan, $5 na lang sa average.</P>
              <PStrong>Iyan ang Blend.</PStrong>
            </>
          ) : (
            <>
              <P>Every AI, every day. Pay only for what you use.</P>
              <P>As a Blend member, use Claude + ChatGPT + Gemini APIs at cost.</P>
              <P>Now $5 a month on average, instead of $60.</P>
              <PStrong>That&apos;s Blend.</PStrong>
            </>
          )}
        </Section>

        {/* Made by */}
        <Section title={isKo ? '만든 곳' : isPh ? 'Ginawa ng' : 'Made by'}>
          <P>MIN Company</P>
        </Section>

        {/* Contact */}
        <Section title={isKo ? '연락' : isPh ? 'Makipag-ugnayan' : 'Contact'}>
          <P>
            <a href="mailto:blend@ai4min.com" style={{ color: tokens.accent }}>
              📧 blend@ai4min.com
            </a>
          </P>
        </Section>

        {/* Version (footer) */}
        <footer
          className="mt-16 pt-8 border-t text-center text-[12px]"
          style={{ borderColor: tokens.border, color: tokens.textFaint }}
        >
          {VERSION} · Build {BUILD_DATE}
        </footer>
      </article>
    </div>
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
    <p className="text-[15px] md:text-[16px] leading-[1.7]" style={{ color: tokens.text }}>
      {children}
    </p>
  );
}

function PStrong({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-4 text-[18px] font-medium leading-[1.6]"
      style={{ color: tokens.text }}
    >
      {children}
    </p>
  );
}
