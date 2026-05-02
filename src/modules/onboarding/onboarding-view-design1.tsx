'use client';

/**
 * D1OnboardingView — Design1 API 키 온보딩 화면
 *
 * 구조:
 *  - Hero: "하나의 AI로는 충분하지 않다" 문구
 *  - 5개 프로바이더 카드: 클릭하면 확장 → 키 입력 → 테스트 → 저장
 *  - "시작하기" 버튼: 1개 이상 키 저장 시 활성화
 *
 * Design tokens: bg #fafaf9, text #0a0a0a, accent #c65a3c
 * Fonts: Instrument Serif (hero), Pretendard/Geist (body)
 */

import { useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useTranslation } from '@/lib/i18n';
import { AIProvider } from '@/types';
import { D1_PROVIDERS, getProviderModelsLabel } from '@/modules/shared/providers-design1';

// ── Design tokens ─────────────────────────────────────────────────
const tokens = {
  bg:         '#fafaf9',
  text:       '#0a0a0a',
  textDim:    '#6b6862',
  textFaint:  '#a8a49b',
  border:     'rgba(10, 10, 10, 0.08)',
  borderMid:  'rgba(10, 10, 10, 0.12)',
  accent:     '#c65a3c',
  accentSoft: 'rgba(198, 90, 60, 0.08)',
  surface:    '#ffffff',
  surfaceHov: 'rgba(10, 10, 10, 0.03)',
} as const;

// ── Inline SVG icons ──────────────────────────────────────────────
const ic = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg {...ic} style={{ transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function EyeIcon()    { return <svg {...ic}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>; }
function EyeOffIcon() { return <svg {...ic}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>; }
function CheckIcon()  { return <svg {...ic}><polyline points="20 6 9 17 4 12"/></svg>; }
function XIcon()      { return <svg {...ic}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function LinkIcon()   { return <svg {...ic}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>; }
function LoaderIcon() { return <svg {...ic} className="animate-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>; }

export function D1OnboardingView({ onDone, lang }: { onDone: () => void; lang: 'ko' | 'en' }) {
  const { keys, setKey } = useAPIKeyStore();
  const { t } = useTranslation();

  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [showKey,    setShowKey]    = useState<Record<string, boolean>>({});
  const [draftKeys,  setDraftKeys]  = useState<Record<string, string>>({});
  const [testing,    setTesting]    = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | null>>({});
  const [saved,      setSaved]      = useState<Record<string, boolean>>({});

  // Count keys that are actually saved (in store)
  const savedCount = D1_PROVIDERS.filter((p) => keys[p.id]).length;
  const canStart   = savedCount > 0;

  const handleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setDraftKeys((prev) => ({ ...prev, [id]: prev[id] ?? keys[id as AIProvider] ?? '' }));
  };

  const handleSave = (id: AIProvider) => {
    const val = (draftKeys[id] ?? '').trim();
    if (!val) return;
    setKey(id, val);
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 2000);
  };

  const handleTest = async (id: AIProvider) => {
    const key = (draftKeys[id] ?? keys[id] ?? '').trim();
    if (!key) return;
    setTesting((s) => ({ ...s, [id]: true }));
    setTestResult((s) => ({ ...s, [id]: null }));
    try {
      let ok = false;
      if (id === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = r.ok;
      } else if (id === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        });
        ok = r.ok;
      } else if (id === 'google') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        ok = r.ok;
      } else if (id === 'deepseek') {
        const r = await fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = r.ok;
      } else if (id === 'groq') {
        const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = r.ok;
      }
      setTestResult((s) => ({ ...s, [id]: ok ? 'ok' : 'fail' }));
      if (ok) {
        // Auto-save on successful test
        setKey(id, key);
        setSaved((s) => ({ ...s, [id]: true }));
        setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 2000);
      }
    } catch {
      setTestResult((s) => ({ ...s, [id]: 'fail' }));
    } finally {
      setTesting((s) => ({ ...s, [id]: false }));
      setTimeout(() => setTestResult((s) => ({ ...s, [id]: null })), 4000);
    }
  };

  const hero = lang === 'ko'
    ? { title: '하나의 AI로는\n충분하지 않다', subtitle: '여러 AI를 하나의 앱에서. API 키만 있으면 됩니다.' }
    : { title: 'One AI is not\nenough', subtitle: 'Multiple AIs in one app. All you need is your API key.' };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16"
      style={{ background: tokens.bg }}
    >
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="mb-12 text-center">
        <h1
          className="mb-4 whitespace-pre-line leading-[1.15] tracking-tight"
          style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            color: tokens.text,
          }}
        >
          {hero.title}
        </h1>
        <p className="text-[15px]" style={{ color: tokens.textDim }}>
          {hero.subtitle}
        </p>
      </div>

      {/* ── Provider cards ───────────────────────────────────── */}
      <div className="w-full max-w-[480px] space-y-2">
        {D1_PROVIDERS.map((p) => {
          const isOpen    = expanded === p.id;
          const isSaved   = !!keys[p.id];
          const draftVal  = draftKeys[p.id] ?? '';
          const tResult   = testResult[p.id];
          const isTesting = testing[p.id];
          const justSaved = saved[p.id];

          return (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl"
              style={{
                border: `1px solid ${isOpen ? tokens.borderMid : tokens.border}`,
                background: tokens.surface,
                boxShadow: isOpen ? '0 2px 16px rgba(0,0,0,0.06)' : 'none',
                transition: 'box-shadow 200ms',
              }}
            >
              {/* Card header — always visible */}
              <button
                onClick={() => handleExpand(p.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors"
                style={{ background: isOpen ? tokens.surfaceHov : 'transparent' }}
              >
                {/* Color dot */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />

                {/* Name + models */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold" style={{ color: tokens.text }}>
                      {p.name}
                    </span>
                    {p.noteKey && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ background: tokens.accentSoft, color: tokens.accent }}
                      >
                        {t(p.noteKey)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: tokens.textFaint }}>
                    {/* [2026-05-02 Roy] registry-derived 동적 라벨 */}
                    {getProviderModelsLabel(p.id)}
                  </p>
                </div>

                {/* Status badge */}
                {isSaved ? (
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: '#22c55e' }}>
                    <CheckIcon /> {lang === 'ko' ? '저장됨' : 'Saved'}
                  </span>
                ) : (
                  <span className="text-[12px]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '미설정' : 'Not set'}
                  </span>
                )}

                {/* Chevron */}
                <span style={{ color: tokens.textFaint }}>
                  <ChevronDownIcon open={isOpen} />
                </span>
              </button>

              {/* Expandable body */}
              {isOpen && (
                <div className="border-t px-5 pb-5 pt-4 space-y-3" style={{ borderColor: tokens.border }}>
                  {/* Key input row */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey[p.id] ? 'text' : 'password'}
                        value={draftVal}
                        onChange={(e) => {
                          setDraftKeys((prev) => ({ ...prev, [p.id]: e.target.value }));
                          setTestResult((s) => ({ ...s, [p.id]: null }));
                        }}
                        placeholder={p.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-xl border px-3 py-2.5 pr-9 font-mono text-[13px] outline-none transition-[border-color]"
                        style={{
                          borderColor: tokens.borderMid,
                          background: 'transparent',
                          color: tokens.text,
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = tokens.accent; }}
                        onBlur={(e)  => { e.currentTarget.style.borderColor = tokens.borderMid; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => ({ ...s, [p.id]: !s[p.id] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: tokens.textFaint }}
                      >
                        {showKey[p.id] ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  {/* Test result feedback */}
                  {tResult === 'ok' && (
                    <p className="flex items-center gap-1.5 text-[12px]" style={{ color: '#22c55e' }}>
                      <CheckIcon /> {lang === 'ko' ? '키 유효함 — 자동 저장됨' : 'Key valid — auto-saved'}
                    </p>
                  )}
                  {tResult === 'fail' && (
                    <p className="flex items-center gap-1.5 text-[12px]" style={{ color: '#ef4444' }}>
                      <XIcon /> {lang === 'ko' ? '키가 유효하지 않습니다' : 'Invalid key — check and retry'}
                    </p>
                  )}

                  {/* Action row */}
                  <div className="flex items-center gap-2 pt-1">
                    {/* Test */}
                    <button
                      onClick={() => handleTest(p.id as AIProvider)}
                      disabled={!draftVal.trim() || isTesting}
                      className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-40"
                      style={{
                        background: tResult === 'ok' ? '#dcfce7' : tResult === 'fail' ? '#fee2e2' : tokens.accentSoft,
                        color: tResult === 'ok' ? '#16a34a' : tResult === 'fail' ? '#dc2626' : tokens.accent,
                      }}
                    >
                      {isTesting ? <LoaderIcon /> : tResult === 'ok' ? <CheckIcon /> : tResult === 'fail' ? <XIcon /> : null}
                      {isTesting
                        ? (lang === 'ko' ? '테스트 중…' : 'Testing…')
                        : (lang === 'ko' ? '테스트' : 'Test')}
                    </button>

                    {/* Save */}
                    <button
                      onClick={() => handleSave(p.id as AIProvider)}
                      disabled={!draftVal.trim() || justSaved}
                      className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-40"
                      style={{
                        background: justSaved ? '#dcfce7' : tokens.text,
                        color: justSaved ? '#16a34a' : tokens.bg,
                      }}
                    >
                      {justSaved ? <CheckIcon /> : null}
                      {justSaved ? (lang === 'ko' ? '저장됨' : 'Saved') : (lang === 'ko' ? '저장' : 'Save')}
                    </button>

                    {/* Get key link */}
                    <a
                      href={p.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
                      style={{ color: tokens.textDim }}
                    >
                      <LinkIcon />
                      {lang === 'ko' ? '발급' : 'Get key'}
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Start button ─────────────────────────────────────── */}
      <div className="mt-10 flex flex-col items-center gap-3">
        <button
          onClick={onDone}
          disabled={!canStart}
          className="rounded-2xl px-8 py-3.5 text-[15px] font-semibold transition-all"
          style={{
            background: canStart ? tokens.text : 'rgba(10,10,10,0.08)',
            color: canStart ? tokens.bg : tokens.textFaint,
            cursor: canStart ? 'pointer' : 'not-allowed',
            boxShadow: canStart ? '0 2px 12px rgba(0,0,0,0.14)' : 'none',
          }}
        >
          {lang === 'ko' ? '시작하기' : 'Get started'}
        </button>
        {!canStart && (
          <p className="text-[13px]" style={{ color: tokens.textFaint }}>
            {lang === 'ko' ? '최소 1개 API 키를 저장하면 시작할 수 있어요' : 'Save at least one API key to continue'}
          </p>
        )}
        {canStart && (
          <p className="text-[13px]" style={{ color: tokens.textFaint }}>
            {lang === 'ko'
              ? `${savedCount}개 프로바이더 연결됨 — 언제든지 설정에서 추가할 수 있어요`
              : `${savedCount} provider${savedCount > 1 ? 's' : ''} connected — add more anytime in Settings`}
          </p>
        )}
      </div>
    </div>
  );
}
