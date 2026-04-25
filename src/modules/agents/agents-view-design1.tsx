'use client';

/**
 * D1AgentsView — Design1 Agents view
 * "특정 역할에 최적화된 AI를 저장하세요."
 *
 * 기존 useAgentStore 재사용. Built-in/Custom 구분은 id 'agent-' 접두 기준.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAgentStore } from '@/stores/agent-store';
import { getFeaturedModels, FEATURED_PROVIDER_ORDER, PROVIDER_LABELS, type ProviderId } from '@/data/available-models';
import type { Agent } from '@/types';

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
  danger:       '#c44',
} as const;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '에이전트',
    subtitle:     '특정 역할에 최적화된 AI를 저장하세요.',
    newAgent:     '+ 새 에이전트',
    builtin:      '기본 제공',
    custom:       '내가 만든',
    emptyCustom:  '아직 만든 에이전트가 없어요',
    edit:         '수정',
    duplicate:    '복제',
    delete:       '삭제',
    confirmDel:   '이 에이전트를 삭제할까요?',
    cancel:       '취소',
    save:         '저장',
    yesDelete:    '삭제',
    new:          '새 에이전트',
    editTitle:    '에이전트 수정',
    fieldEmoji:   '이모지',
    fieldName:    '이름',
    fieldDesc:    '설명',
    fieldModel:   '모델',
    fieldPrompt:  '시스템 프롬프트',
    placeName:    '예: 번역가',
    placeDesc:    '한 줄 설명',
    placePrompt:  '당신은...',
    chooseEmoji:  '이모지 선택',
  },
  en: {
    title:        'Agents',
    subtitle:     'Save AI for specific roles.',
    newAgent:     '+ New agent',
    builtin:      'Built-in',
    custom:       'Custom',
    emptyCustom:  'No custom agents yet',
    edit:         'Edit',
    duplicate:    'Duplicate',
    delete:       'Delete',
    confirmDel:   'Delete this agent?',
    cancel:       'Cancel',
    save:         'Save',
    yesDelete:    'Delete',
    new:          'New agent',
    editTitle:    'Edit agent',
    fieldEmoji:   'Emoji',
    fieldName:    'Name',
    fieldDesc:    'Description',
    fieldModel:   'Model',
    fieldPrompt:  'System prompt',
    placeName:    'e.g. Translator',
    placeDesc:    'One-line description',
    placePrompt:  'You are...',
    chooseEmoji:  'Choose emoji',
  },
} as const;

const EMOJI_PALETTE = [
  '🌐', '💻', '✍️', '📊', '📝', '📧', '🎯', '🇰🇷',
  '🤖', '🧠', '💡', '⚡', '🎨', '🎭', '🎬', '🎵',
  '⚖️', '🍳', '📚', '🔬', '💼', '🏥', '🏫', '✨',
  '🛠️', '📈', '🔍', '🗂️', '📅', '📌', '🎤', '🎙️',
];

const AUTO_MATCH_ID = 'agent-auto-match';

// ── Helpers ──────────────────────────────────────────────────────
function isBuiltin(id: string): boolean {
  return id.startsWith('agent-') && id !== AUTO_MATCH_ID;
}

// ── Main ─────────────────────────────────────────────────────────
export default function D1AgentsView({
  lang,
  onStartChat,
}: {
  lang: 'ko' | 'en';
  onStartChat?: (modelId: string) => void;
}) {
  const t = copy[lang];

  const agents          = useAgentStore((s) => s.agents);
  const addAgent        = useAgentStore((s) => s.addAgent);
  const updateAgent     = useAgentStore((s) => s.updateAgent);
  const deleteAgent     = useAgentStore((s) => s.deleteAgent);
  const duplicateAgent  = useAgentStore((s) => s.duplicateAgent);
  const setActiveAgent  = useAgentStore((s) => s.setActiveAgent);
  const incrementUsage  = useAgentStore((s) => s.incrementUsage);
  const loadFromStorage = useAgentStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage, lang]);

  const [editing, setEditing]     = useState<Agent | null>(null);
  const [creating, setCreating]   = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const { builtins, customs } = useMemo(() => {
    const b: Agent[] = [];
    const c: Agent[] = [];
    for (const a of agents) {
      if (a.id === AUTO_MATCH_ID) continue; // hide auto-match (handled by chat view)
      (isBuiltin(a.id) ? b : c).push(a);
    }
    return { builtins: b, customs: c };
  }, [agents]);

  function handleCardClick(agent: Agent) {
    setActiveAgent(agent.id);
    incrementUsage(agent.id);
    onStartChat?.(agent.model);
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        <header className="mb-8">
          <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight">
            {t.title}
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: tokens.textDim }}>
            {t.subtitle}
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-6 rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{ background: tokens.text, color: tokens.bg }}
          >
            {t.newAgent}
          </button>
        </header>

        {builtins.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              {t.builtin}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {builtins.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isCustom={false}
                  onClick={() => handleCardClick(a)}
                  onMenuClick={() => setMenuOpenId(menuOpenId === a.id ? null : a.id)}
                  menuOpen={menuOpenId === a.id}
                  onDuplicate={() => { duplicateAgent(a.id); setMenuOpenId(null); }}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  t={t}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.custom}
          </h2>
          {customs.length === 0 ? (
            <div
              className="rounded-2xl border p-10 text-center text-[14px]"
              style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.textDim }}
            >
              {t.emptyCustom}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {customs.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isCustom
                  onClick={() => handleCardClick(a)}
                  onMenuClick={() => setMenuOpenId(menuOpenId === a.id ? null : a.id)}
                  menuOpen={menuOpenId === a.id}
                  onDuplicate={() => { duplicateAgent(a.id); setMenuOpenId(null); }}
                  onEdit={() => { setEditing(a); setMenuOpenId(null); }}
                  onDelete={() => { setDeleting(a.id); setMenuOpenId(null); }}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {(editing || creating) && (
        <AgentEditor
          lang={lang}
          t={t}
          existing={editing ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(data) => {
            if (editing) updateAgent(editing.id, data);
            else addAgent(data);
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          message={t.confirmDel}
          confirmLabel={t.yesDelete}
          cancelLabel={t.cancel}
          onConfirm={() => { deleteAgent(deleting); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ── AgentCard ────────────────────────────────────────────────────
function AgentCard({
  agent, isCustom, onClick, onMenuClick, menuOpen, onDuplicate, onEdit, onDelete, t,
}: {
  agent: Agent;
  isCustom: boolean;
  onClick: () => void;
  onMenuClick: () => void;
  menuOpen: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: typeof copy[keyof typeof copy];
}) {
  return (
    <div
      className="group relative rounded-2xl border p-4 transition-all hover:-translate-y-px hover:border-[var(--accent)] cursor-pointer"
      style={{
        background: tokens.surface,
        borderColor: tokens.border,
        ['--accent' as any]: tokens.accent,
        aspectRatio: '4/5',
      }}
      onClick={onClick}
    >
      <div className="flex h-full flex-col">
        <div className="text-[36px] leading-none">{agent.icon || '🤖'}</div>

        <div className="mt-auto">
          <div className="text-[14px] font-medium truncate" style={{ color: tokens.text }}>
            {agent.name}
          </div>
          <div className="mt-1 line-clamp-2 text-[11.5px]" style={{ color: tokens.textDim }}>
            {agent.description}
          </div>
          <div className="mt-2 truncate text-[10.5px]" style={{ color: tokens.textFaint, fontFamily: 'ui-monospace, monospace' }}>
            {agent.model}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMenuClick(); }}
        className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5"
        style={{ color: tokens.textFaint }}
        aria-label="menu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5"  cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute right-2 top-9 z-10 min-w-[120px] rounded-lg border p-1 shadow-md"
          style={{ background: tokens.surface, borderColor: tokens.borderStrong }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onDuplicate}
            className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-black/5"
            style={{ color: tokens.text }}
          >
            {t.duplicate}
          </button>
          {isCustom && (
            <>
              <button
                onClick={onEdit}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-black/5"
                style={{ color: tokens.text }}
              >
                {t.edit}
              </button>
              <button
                onClick={onDelete}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-black/5"
                style={{ color: tokens.danger }}
              >
                {t.delete}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── AgentEditor ──────────────────────────────────────────────────
function AgentEditor({
  lang, t, existing, onClose, onSave,
}: {
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  existing?: Agent;
  onClose: () => void;
  onSave: (data: Omit<Agent, 'id' | 'createdAt'>) => void;
}) {
  const [icon, setIcon]                 = useState(existing?.icon || '🤖');
  const [name, setName]                 = useState(existing?.name || '');
  const [description, setDescription]   = useState(existing?.description || '');
  const [model, setModel]               = useState(existing?.model || 'gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt || '');
  const [showEmoji, setShowEmoji]       = useState(false);

  const featured = useMemo(() => getFeaturedModels(), []);

  function canSave() {
    return name.trim().length > 0 && systemPrompt.trim().length > 0;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-[20px] font-medium tracking-tight">
          {existing ? t.editTitle : t.new}
        </h2>

        <div className="space-y-4">
          {/* Emoji */}
          <div>
            <label className="mb-1.5 block text-[12px]" style={{ color: tokens.textDim }}>{t.fieldEmoji}</label>
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="flex h-12 w-12 items-center justify-center rounded-lg border text-[28px] transition-colors hover:bg-black/5"
              style={{ borderColor: tokens.borderStrong }}
            >
              {icon}
            </button>
            {showEmoji && (
              <div className="mt-2 grid grid-cols-8 gap-1 rounded-lg border p-2" style={{ borderColor: tokens.border }}>
                {EMOJI_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setIcon(e); setShowEmoji(false); }}
                    className="h-8 w-8 rounded text-[20px] hover:bg-black/5"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <Field label={t.fieldName}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.placeName}
              className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors focus:border-current"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
            />
          </Field>

          {/* Description */}
          <Field label={t.fieldDesc}>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.placeDesc}
              className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none focus:border-current"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
            />
          </Field>

          {/* Model */}
          <Field label={t.fieldModel}>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none focus:border-current"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
            >
              {FEATURED_PROVIDER_ORDER.map((p) => {
                const list = featured.filter((m) => m.provider === p);
                if (list.length === 0) return null;
                return (
                  <optgroup key={p} label={PROVIDER_LABELS[p as ProviderId][lang]}>
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </Field>

          {/* System prompt */}
          <Field label={t.fieldPrompt}>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t.placePrompt}
              rows={6}
              className="w-full rounded-lg border px-3 py-2 text-[13px] leading-[1.5] outline-none focus:border-current"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px]"
            style={{ color: tokens.textDim }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!canSave()}
            onClick={() => onSave({
              name: name.trim(),
              description: description.trim(),
              model,
              systemPrompt: systemPrompt.trim(),
              icon,
            })}
            className="rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-40"
            style={{ background: tokens.text, color: tokens.bg }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px]" style={{ color: tokens.textDim }}>{label}</label>
      {children}
    </div>
  );
}

function ConfirmModal({
  message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-[13px]" style={{ color: tokens.textDim }}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-[13px] text-white"
            style={{ background: tokens.danger }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
