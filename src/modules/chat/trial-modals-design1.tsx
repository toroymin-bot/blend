'use client';

import { X, ExternalLink } from 'lucide-react';

const tokens = {
  bg: '#fafaf9',
  surface: '#ffffff',
  text: '#0a0a0a',
  textDim: '#6b6862',
  textFaint: '#a8a49b',
  accent: '#c65a3c',
  accentSoft: 'rgba(198, 90, 60, 0.08)',
  border: 'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
} as const;

function fontStack(lang: 'ko' | 'en') {
  return lang === 'ko'
    ? '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif'
    : '"Geist", -apple-system, system-ui, sans-serif';
}

// ============================================================
// Shared modal shell
// ============================================================
function D1ModalShell({
  lang,
  title,
  subtitle,
  onClose,
  children,
}: {
  lang: 'ko' | 'en';
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: 'd1-fade 180ms ease both' }}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,10,10,0.32)' }}
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[20px]"
        style={{
          background: tokens.surface,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          fontFamily: fontStack(lang),
          animation: 'd1-rise 260ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/5"
          style={{ color: tokens.textFaint }}
          aria-label={lang === 'ko' ? '닫기' : 'Close'}
        >
          <X size={14} />
        </button>

        <div className="px-7 pt-9 pb-6">
          <h2
            className="text-[22px] font-medium leading-[1.2] tracking-[-0.02em]"
            style={{ color: tokens.text }}
          >
            {title}
          </h2>
          <p
            className="mt-2.5 text-[14px] leading-[1.55]"
            style={{ color: tokens.textDim }}
          >
            {subtitle}
          </p>
        </div>

        <div
          className="border-t px-7 py-5"
          style={{ borderColor: tokens.border }}
        >
          {children}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes d1-rise {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}

// ============================================================
// Trial exhausted modal — shown when dailyCount >= maxPerDay
// ============================================================
export function D1TrialExhaustedModal({
  lang,
  onOpenOnboarding,
  onClose,
}: {
  lang: 'ko' | 'en';
  onOpenOnboarding: () => void;
  onClose: () => void;
}) {
  const copy = lang === 'ko'
    ? {
        title: '오늘 무료 체험이 끝났어요',
        subtitle: '10회 모두 사용하셨습니다. 내일 다시 충전되거나, 키를 연결해 무제한으로 쓸 수 있어요.',
        primary: 'Google 무료 키 받기',
        primaryNote: '30초면 됩니다',
        secondary: '이미 있음, 입력하기',
        tertiary: '오늘은 여기까지',
      }
    : {
        title: "Today's trial is used up",
        subtitle: "You've used all 10 turns. They refill tomorrow — or connect a key for unlimited access.",
        primary: 'Get a free Google key',
        primaryNote: '30 seconds',
        secondary: 'I have one — enter it',
        tertiary: 'Come back tomorrow',
      };

  return (
    <D1ModalShell
      lang={lang}
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-medium transition-transform hover:-translate-y-px"
          style={{ background: tokens.text, color: tokens.bg }}
          onClick={onClose}
        >
          {copy.primary}
          <ExternalLink size={13} />
        </a>
        <p className="-mt-1 text-center text-[11.5px]" style={{ color: tokens.textFaint }}>
          {copy.primaryNote}
        </p>
        <button
          onClick={() => { onOpenOnboarding(); onClose(); }}
          className="mt-2 rounded-[12px] py-3 text-[14px] font-medium transition-colors hover:bg-black/5"
          style={{
            background: 'transparent',
            color: tokens.text,
            border: `1px solid ${tokens.borderStrong}`,
          }}
        >
          {copy.secondary}
        </button>
        <button
          onClick={onClose}
          className="mt-1 text-[13px] transition-colors hover:underline"
          style={{ color: tokens.textFaint }}
        >
          {copy.tertiary}
        </button>
      </div>
    </D1ModalShell>
  );
}

// ============================================================
// Key required modal — shown when user selects paid model (Claude/GPT) without key
// ============================================================
export function D1KeyRequiredModal({
  lang,
  providerName,
  onSwitchToGemini,
  onOpenOnboarding,
  onClose,
}: {
  lang: 'ko' | 'en';
  providerName: string; // e.g. "Anthropic", "OpenAI"
  onSwitchToGemini: () => void;
  onOpenOnboarding: () => void;
  onClose: () => void;
}) {
  const copy = lang === 'ko'
    ? {
        title: `${providerName}에는 키가 필요해요`,
        subtitle: '이 제공사는 계정 생성과 결제 카드 등록이 필요합니다. 체험을 계속하려면 무료 모델로 전환하세요.',
        primary: 'Gemini로 전환 (무료)',
        secondary: '내 키 입력하기',
        tertiary: '취소',
      }
    : {
        title: `${providerName} needs a key`,
        subtitle: 'This provider requires an account and payment. Switch to the free model to keep using trial.',
        primary: 'Switch to Gemini (free)',
        secondary: 'Enter my key',
        tertiary: 'Cancel',
      };

  return (
    <D1ModalShell
      lang={lang}
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <button
          onClick={() => { onSwitchToGemini(); onClose(); }}
          className="rounded-[12px] py-3 text-[14px] font-medium transition-transform hover:-translate-y-px"
          style={{ background: tokens.text, color: tokens.bg }}
        >
          {copy.primary}
        </button>
        <button
          onClick={() => { onOpenOnboarding(); onClose(); }}
          className="rounded-[12px] py-3 text-[14px] font-medium transition-colors hover:bg-black/5"
          style={{
            background: 'transparent',
            color: tokens.text,
            border: `1px solid ${tokens.borderStrong}`,
          }}
        >
          {copy.secondary}
        </button>
        <button
          onClick={onClose}
          className="mt-1 text-[13px] transition-colors hover:underline"
          style={{ color: tokens.textFaint }}
        >
          {copy.tertiary}
        </button>
      </div>
    </D1ModalShell>
  );
}
