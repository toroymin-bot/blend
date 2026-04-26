'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { decodeShare, isExpired, relativeTime, type SharePayload } from '@/lib/share-encoder';

const tokens = {
  bg:           '#fafaf9',
  surface:      '#ffffff',
  surfaceAlt:   '#f5f4f0',
  text:         '#0a0a0a',
  textDim:      '#6b6b6b',
  textFaint:    '#a0a0a0',
  accent:       '#c65a3c',
  accentSoft:   'rgba(198,90,60,0.12)',
  border:       '#e5e5e5',
  userBubble:   '#f5f4f0',
};

const COPY = {
  ko: {
    title: '공유받은 대화',
    author: '작성자: 익명',
    expired: '이 대화는 만료되었습니다',
    invalid: '잘못된 공유 링크',
    cta: '💡 나도 블렌드 시작하기 →',
    tagline: '5개 AI를 하나의 키로',
  },
  en: {
    title: 'Shared conversation',
    author: 'By: Anonymous',
    expired: 'This conversation has expired',
    invalid: 'Invalid share link',
    cta: '💡 Start using Blend →',
    tagline: 'Every AI, with one key',
  },
};

export default function SharePageClient() {
  const params = useParams<{ lang?: string }>();
  const lang: 'ko' | 'en' = params?.lang === 'en' ? 'en' : 'ko';
  const t = COPY[lang];

  const [token, setToken] = useState<string>('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setToken(sp.get('t') ?? '');
  }, []);

  const decoded: { payload: SharePayload | null; expired: boolean } = useMemo(() => {
    if (!token) return { payload: null, expired: false };
    const p = decodeShare(token);
    if (!p) return { payload: null, expired: false };
    return { payload: p, expired: isExpired(p) };
  }, [token]);

  return (
    <div
      className="min-h-screen"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-[680px] px-6 py-10 md:py-14">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-[12px] uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              📤 {t.title}
            </div>
            {decoded.payload && (
              <div className="mt-1 text-[12px]" style={{ color: tokens.textDim }}>
                {t.author} · {relativeTime(decoded.payload.createdAt, lang)}
              </div>
            )}
          </div>
          <a
            href={`/${lang}`}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            Blend →
          </a>
        </header>

        {!token || !decoded.payload ? (
          <ErrorPanel title={t.invalid} lang={lang} />
        ) : decoded.expired ? (
          <ErrorPanel title={t.expired} lang={lang} />
        ) : (
          <>
            <div className="space-y-5">
              {decoded.payload.messages.map((m, i) => (
                <Message key={i} role={m.role} content={m.content} model={m.model} />
              ))}
            </div>
            <div className="mt-12 border-t pt-8 text-center" style={{ borderColor: tokens.border }}>
              <a
                href={`/${lang}`}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90"
                style={{ background: tokens.accent, color: '#fff' }}
              >
                {t.cta}
              </a>
              <div className="mt-2 text-[11.5px]" style={{ color: tokens.textFaint }}>
                ({t.tagline})
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Message({ role, content, model }: { role: 'user' | 'assistant'; content: string; model?: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-[1.55]"
          style={{ background: tokens.userBubble, color: tokens.text }}
        >
          {content}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11.5px]" style={{ color: tokens.textFaint }}>
        <span aria-hidden style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 14, color: tokens.accent }}>B</span>
        {model && <span>{model}</span>}
      </div>
      <div className="whitespace-pre-wrap text-[14.5px] leading-[1.7]" style={{ color: tokens.text }}>
        {content}
      </div>
    </div>
  );
}

function ErrorPanel({ title, lang }: { title: string; lang: 'ko' | 'en' }) {
  return (
    <div
      className="rounded-2xl border p-10 text-center"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[16px] font-medium" style={{ color: tokens.text }}>{title}</div>
      <div className="mt-2 text-[13px]" style={{ color: tokens.textDim }}>
        {lang === 'ko' ? '새 대화를 만들어 친구에게 다시 공유해보세요.' : 'Create a new conversation and share it again.'}
      </div>
      <a
        href={`/${lang}`}
        className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium"
        style={{ background: tokens.accent, color: '#fff' }}
      >
        {lang === 'ko' ? 'Blend 시작 →' : 'Start using Blend →'}
      </a>
    </div>
  );
}
