'use client';

/**
 * D1ModelsView — Design1 Models view
 * 5개 프로바이더 · N개 모델 카탈로그.
 *
 * Self-contained. AVAILABLE_MODELS + isTrialModel 재사용.
 */

import { useMemo, useState } from 'react';
import {
  AVAILABLE_MODELS,
  FEATURED_PROVIDER_ORDER,
  PROVIDER_LABELS,
  REGISTRY_GENERATED_AT,
  isTrialModel,
  type AvailableModel,
  type ProviderId,
} from '@/data/available-models';
import { useAPIKeyStore } from '@/stores/api-key-store';
import type { AIProvider } from '@/types';

// ── Design tokens ────────────────────────────────────────────────
const tokens = {
  bg:           '#fafaf9',
  surface:      '#ffffff',
  surfaceAlt:   '#f6f5f3',
  text:         '#0a0a0a',
  textDim:      '#6b6862',
  textFaint:    '#a8a49b',
  accent:       '#c65a3c',
  accentSoft:   'rgba(198, 90, 60, 0.08)',
  border:       'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
} as const;

const BRAND_COLORS: Record<ProviderId, string> = {
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
  deepseek:  '#4B5EFC',
  groq:      '#f55036',
};

const PROVIDER_TO_AIPROV: Record<ProviderId, AIProvider> = {
  openai:    'openai',
  anthropic: 'anthropic',
  google:    'google',
  deepseek:  'deepseek',
  groq:      'groq',
};

// ── Filter ───────────────────────────────────────────────────────
type FilterId = 'all' | 'free' | 'vision' | 'reasoning' | 'long';

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '모델',
    countFmt:     (p: number, m: number) => `${p}개 프로바이더 · ${m}개 모델`,
    filters: {
      all:        '전체',
      free:       '무료',
      vision:     '비전',
      reasoning:  '추론',
      long:       '긴 문서',
    },
    contextLabel: '컨텍스트',
    visionBadge:  '비전',
    reasonBadge:  '추론',
    startChat:    '이 모델로 채팅 →',
    trialBadge:   '체험 가능',
    needKey:      '키가 필요해요',
    enterKey:     '키 입력하기',
    deprecated:   '단종 예정',
    lastUpdate:   '마지막 업데이트',
    none:         '해당하는 모델이 없어요',
  },
  en: {
    title:        'Models',
    countFmt:     (p: number, m: number) => `${p} providers · ${m} models`,
    filters: {
      all:        'All',
      free:       'Free',
      vision:     'Vision',
      reasoning:  'Reasoning',
      long:       'Long context',
    },
    contextLabel: 'Context',
    visionBadge:  'Vision',
    reasonBadge:  'Reasoning',
    startChat:    'Start chat →',
    trialBadge:   'Free trial',
    needKey:      'Needs key',
    enterKey:     'Enter key',
    deprecated:   'Deprecated',
    lastUpdate:   'Last updated',
    none:         'No matching models',
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────
function fmtContext(n?: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000)     return `${Math.round(n / 1000)}K`;
  return String(n);
}

function fmtRegistryDate(iso: string, lang: 'ko' | 'en'): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (lang === 'ko') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function modelMatchesFilter(m: AvailableModel, f: FilterId): boolean {
  switch (f) {
    case 'all':       return true;
    case 'free':      return m.tier === 'trial' || m.provider === 'groq';
    case 'vision':    return !!m.supportsVision;
    case 'reasoning': return m.tier === 'reasoning';
    case 'long':      return (m.contextWindow ?? 0) >= 1_000_000;
  }
}

// ── Main view ────────────────────────────────────────────────────
export default function D1ModelsView({
  lang,
  onSelectModel,
  onOpenOnboarding,
}: {
  lang: 'ko' | 'en';
  onSelectModel?: (modelId: string) => void;
  onOpenOnboarding?: () => void;
}) {
  const t = copy[lang];
  const [filter, setFilter] = useState<FilterId>('all');

  const { hasKey } = useAPIKeyStore();

  const grouped = useMemo(() => {
    const filtered = AVAILABLE_MODELS.filter((m) => !m.deprecated && modelMatchesFilter(m, filter));
    const map = new Map<ProviderId, AvailableModel[]>();
    for (const p of FEATURED_PROVIDER_ORDER) map.set(p, []);
    for (const m of filtered) {
      const arr = map.get(m.provider);
      if (arr) arr.push(m);
    }
    // Sort each provider's list: trial tier first, then flagship, then by name
    const tierRank: Record<string, number> = { trial: 0, flagship: 1, reasoning: 2, balanced: 3, fast: 4 };
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ar = tierRank[a.tier] ?? 5;
        const br = tierRank[b.tier] ?? 5;
        if (ar !== br) return ar - br;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    return map;
  }, [filter]);

  const totalCount = useMemo(
    () => Array.from(grouped.values()).reduce((s, arr) => s + arr.length, 0),
    [grouped],
  );

  const totalAll = useMemo(
    () => AVAILABLE_MODELS.filter((m) => !m.deprecated).length,
    [],
  );

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        {/* ══ Hero ══ */}
        <header className="mb-8">
          <h1
            className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight"
            style={{ color: tokens.text }}
          >
            {t.title}
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: tokens.textDim }}>
            {t.countFmt(FEATURED_PROVIDER_ORDER.length, totalAll)}
          </p>
        </header>

        {/* ══ Filter chips ══ */}
        <div className="mb-8 flex flex-wrap gap-2 overflow-x-auto">
          {(['all', 'free', 'vision', 'reasoning', 'long'] as FilterId[]).map((f) => (
            <FilterChip
              key={f}
              label={t.filters[f]}
              isActive={filter === f}
              onClick={() => setFilter(f)}
            />
          ))}
        </div>

        {/* ══ Grouped list ══ */}
        {totalCount === 0 ? (
          <div
            className="rounded-2xl border p-10 text-center"
            style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.textDim }}
          >
            {t.none}
          </div>
        ) : (
          <div className="space-y-10">
            {FEATURED_PROVIDER_ORDER.map((provider) => {
              const list = grouped.get(provider) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={provider}>
                  <h2
                    className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]"
                    style={{ color: tokens.textFaint }}
                  >
                    {PROVIDER_LABELS[provider][lang]}
                  </h2>
                  <div className="space-y-3">
                    {list.map((m) => (
                      <ModelCard
                        key={m.id}
                        model={m}
                        hasUserKey={hasKey(PROVIDER_TO_AIPROV[m.provider])}
                        lang={lang}
                        t={t}
                        onSelect={() => onSelectModel?.(m.id)}
                        onEnterKey={() => onOpenOnboarding?.()}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ══ Last update ══ */}
        {REGISTRY_GENERATED_AT && (
          <p className="mt-12 text-[11px]" style={{ color: tokens.textFaint }}>
            {t.lastUpdate}: {fmtRegistryDate(REGISTRY_GENERATED_AT, lang)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function FilterChip({
  label, isActive, onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-colors"
      style={{
        background: isActive ? tokens.accent : 'transparent',
        color: isActive ? '#fff' : tokens.textDim,
        border: isActive ? 'none' : `1px solid ${tokens.borderStrong}`,
      }}
    >
      {label}
    </button>
  );
}

function ModelCard({
  model, hasUserKey, lang, t, onSelect, onEnterKey,
}: {
  model: AvailableModel;
  hasUserKey: boolean;
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  onSelect: () => void;
  onEnterKey: () => void;
}) {
  const trial = isTrialModel(model.id);
  const canUse = hasUserKey || trial;
  const dotColor = BRAND_COLORS[model.provider];

  return (
    <div
      className="rounded-xl border p-4 md:p-5"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
          style={{ background: dotColor }}
        />
        <span className="text-[15px] font-medium" style={{ color: tokens.text }}>
          {model.displayName}
        </span>
        {trial && !hasUserKey && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10.5px]"
            style={{ background: tokens.accentSoft, color: tokens.accent }}
          >
            {t.trialBadge}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[13px]" style={{ color: tokens.textDim }}>
        {lang === 'ko' ? model.description_ko : model.description_en}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]" style={{ color: tokens.textFaint }}>
        {model.contextWindow != null && (
          <span>
            {t.contextLabel} {fmtContext(model.contextWindow)}
          </span>
        )}
        {model.supportsVision && (
          <span className="rounded-md px-1.5 py-0.5" style={{ background: tokens.surfaceAlt }}>
            {t.visionBadge}
          </span>
        )}
        {model.tier === 'reasoning' && (
          <span className="rounded-md px-1.5 py-0.5" style={{ background: tokens.surfaceAlt }}>
            {t.reasonBadge}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <code
          className="truncate text-[11px]"
          style={{ color: tokens.textFaint, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
        >
          {model.id}
        </code>

        {canUse ? (
          <button
            type="button"
            onClick={onSelect}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
            style={{ background: tokens.text, color: tokens.bg }}
          >
            {t.startChat}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11.5px]" style={{ color: tokens.textFaint }}>
              {t.needKey}
            </span>
            <button
              type="button"
              onClick={onEnterKey}
              className="text-[12px] font-medium transition-opacity hover:underline"
              style={{ color: tokens.accent }}
            >
              {t.enterKey}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
