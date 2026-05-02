'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const tokens = {
  bg:          '#fafaf9',
  surface:     '#ffffff',
  text:        '#0a0a0a',
  textDim:     '#6b6862',
  textFaint:   '#a8a49b',
  accent:      '#c65a3c',
  accentSoft:  'rgba(198, 90, 60, 0.08)',
  border:      'rgba(10, 10, 10, 0.06)',
  borderStrong:'rgba(10, 10, 10, 0.12)',
} as const;

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  model: string;
  preview?: string;
  allText?: string;
  // P3.1 — 조직화 메타
  pinned?: boolean;
  tags?: string[];
}

interface D1HistoryOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  onDelete?: (chatId: string) => void;
  // P3.1 — 핀 토글
  onTogglePin?: (chatId: string) => void;
  chats: ChatSummary[];
  lang: 'ko' | 'en';
  // [2026-05-02 Roy] '이전 세션 기억하기' 멀티 선택 — 현재 세션 컨텍스트로 주입.
  // 새 세션에선 자동 초기화. 노란 highlight로 선택 표시.
  selectedMemoryIds?: string[];
  onToggleMemory?: (chatId: string) => void;
}

type FilterRange = 'today' | 'week' | 'month' | 'all';

export function D1HistoryOverlay({
  open, onClose, onSelect, onDelete, onTogglePin, chats, lang,
  selectedMemoryIds = [], onToggleMemory,
}: D1HistoryOverlayProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterRange>('all');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // [2026-05-02 Roy] 첫 1회 코치마크 — '북마크 클릭 → 채팅 기억하기' 안내.
  // localStorage 'd1:memory-coachmark-seen' 가드. 사용자가 어느 한 곳에서 한 번
  // 보면 영구 안 나옴. 4초 후 자동 dismiss.
  const [showCoachmark, setShowCoachmark] = useState(false);

  // Reset + focus on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setFilter('all');
      setHighlightIdx(0);
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      // 코치마크 — 채팅 1+ 있고, 메모리 토글 prop 있고, 처음 열 때만
      if (typeof window !== 'undefined' && onToggleMemory && chats.length > 0) {
        const seen = localStorage.getItem('d1:memory-coachmark-seen') === 'true';
        if (!seen) {
          setShowCoachmark(true);
          // 4초 후 자동 dismiss + 영구 가드
          setTimeout(() => {
            setShowCoachmark(false);
            localStorage.setItem('d1:memory-coachmark-seen', 'true');
          }, 4000);
        }
      }
      return () => clearTimeout(id);
    } else {
      setShowCoachmark(false);
    }
  }, [open]);

  // Compute time boundaries once per render
  const { startOfToday, startOfYesterday, startOfWeek, startOfMonth } = useMemo(() => {
    const oneDay = 24 * 60 * 60 * 1000;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const sow = new Date(t);
    const day = t.getDay();
    sow.setDate(t.getDate() + ((day === 0 ? -6 : 1) - day));
    const som = new Date(t.getFullYear(), t.getMonth(), 1);
    return {
      startOfToday: t.getTime(),
      startOfYesterday: t.getTime() - oneDay,
      startOfWeek: sow.getTime(),
      startOfMonth: som.getTime(),
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inRange = (c: ChatSummary) => {
      if (filter === 'all')   return true;
      if (filter === 'today') return c.updatedAt >= startOfToday;
      if (filter === 'week')  return c.updatedAt >= startOfWeek;
      if (filter === 'month') return c.updatedAt >= startOfMonth;
      return true;
    };
    const matches = (c: ChatSummary) => {
      if (!q) return true;
      const hay = `${c.title} ${c.allText ?? ''} ${c.preview ?? ''}`.toLowerCase();
      return hay.includes(q);
    };
    return chats
      .filter(inRange)
      .filter(matches)
      // P3.1 — 핀 우선 정렬, 그 다음 최신순
      .sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return b.updatedAt - a.updatedAt;
      });
  }, [chats, filter, query, startOfToday, startOfWeek, startOfMonth]);

  // Keyboard nav + ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = filtered[highlightIdx];
        if (sel) { onSelect(sel.id); onClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, highlightIdx, onSelect, onClose]);

  const counts = useMemo(() => ({
    today: chats.filter((c) => c.updatedAt >= startOfToday).length,
    week:  chats.filter((c) => c.updatedAt >= startOfWeek).length,
    month: chats.filter((c) => c.updatedAt >= startOfMonth).length,
    all:   chats.length,
  }), [chats, startOfToday, startOfWeek, startOfMonth]);

  const groups = useMemo(() => {
    const buckets = { today: [] as ChatSummary[], yesterday: [] as ChatSummary[], week: [] as ChatSummary[], month: [] as ChatSummary[], older: [] as ChatSummary[] };
    for (const c of filtered) {
      if (c.updatedAt >= startOfToday) buckets.today.push(c);
      else if (c.updatedAt >= startOfYesterday) buckets.yesterday.push(c);
      else if (c.updatedAt >= startOfWeek) buckets.week.push(c);
      else if (c.updatedAt >= startOfMonth) buckets.month.push(c);
      else buckets.older.push(c);
    }
    return buckets;
  }, [filtered, startOfToday, startOfYesterday, startOfWeek, startOfMonth]);

  const L = lang === 'ko'
    ? {
        placeholder: '모든 대화 검색...',
        today: '오늘', week: '이번 주', month: '이번 달', all: '전체',
        groupToday: '오늘', groupYesterday: '어제',
        groupWeek: '이번 주', groupMonth: '이번 달', groupOlder: '더 오래된',
        empty: '검색 결과가 없어요',
        emptyAll: '아직 저장된 대화가 없어요',
        hint: '↑↓ 이동 · Enter 열기 · ESC 닫기',
        untitled: '제목 없음',
        msgs: (n: number) => `${n}개 메시지`,
        delete: '삭제',
      }
    : {
        placeholder: 'Search all conversations...',
        today: 'Today', week: 'This week', month: 'This month', all: 'All',
        groupToday: 'Today', groupYesterday: 'Yesterday',
        groupWeek: 'This week', groupMonth: 'This month', groupOlder: 'Older',
        empty: 'No results',
        emptyAll: 'No saved conversations yet',
        hint: '↑↓ Navigate · Enter Open · ESC Close',
        untitled: 'Untitled',
        msgs: (n: number) => `${n} msgs`,
        delete: 'Delete',
      };

  const formatRelative = (ts: number): string => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    const hours   = Math.floor(diff / 3600000);
    const days    = Math.floor(diff / 86400000);
    if (lang === 'ko') {
      if (minutes < 1)  return '방금 전';
      if (minutes < 60) return `${minutes}분 전`;
      if (hours < 24)   return `${hours}시간 전`;
      if (days === 1)   return '어제';
      if (days < 5)     return `${days}일 전`;
      const d = new Date(ts);
      return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24)   return `${hours}h ago`;
    if (days === 1)   return 'yesterday';
    if (days < 5)     return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!open) return null;

  const renderGroup = (label: string, list: ChatSummary[], startIdx: number) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-3" key={label}>
        <div
          className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: tokens.textFaint }}
        >
          {label}
        </div>
        {list.map((c, localI) => {
          const globalIdx = startIdx + localI;
          const isActive = globalIdx === highlightIdx;
          return (
            <div
              key={c.id}
              onMouseEnter={() => setHighlightIdx(globalIdx)}
              className="group flex items-start gap-2 px-4 py-2.5 transition-colors"
              style={{ background: isActive ? tokens.accentSoft : 'transparent' }}
            >
              <button
                onClick={() => { onSelect(c.id); onClose(); }}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
              >
                <div className="flex items-center gap-1.5 truncate text-[14px] font-medium" style={{ color: tokens.text }}>
                  {c.pinned && (
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" style={{ color: tokens.textFaint }}>
                      <path d="M12 2L9 9 2 9.75l5.5 5.25L6 22l6-3 6 3-1.5-7L22 9.75 15 9z" />
                    </svg>
                  )}
                  <span className="truncate">{c.title || L.untitled}</span>
                </div>
                <div className="flex items-center gap-2 text-[11.5px]" style={{ color: tokens.textFaint }}>
                  <span>{formatRelative(c.updatedAt)}</span>
                  <span>·</span>
                  <span className="truncate">{c.model}</span>
                  <span>·</span>
                  <span>{L.msgs(c.messageCount)}</span>
                </div>
              </button>
              {/* [2026-05-02 Roy] 이전 세션 기억하기 토글 — 멀티 선택. 선택 시
                  연노랑 highlight + 채워진 아이콘. 클릭 시 부모가 selectedMemoryIds
                  관리. 행 hover 시 노출. */}
              {/* [2026-05-02 Roy 결정 'A'] 발견율 ↑ — hover 의존 제거. 모든 행에
                  살짝 보이는 회색 북마크 → hover 시 진해지고 선택 시 노란색.
                  시각 노이즈 미미하면서 사용자가 "이게 뭐지?" 인지 가능. */}
              {/* [2026-05-02 Roy] 커스텀 즉시-표시 툴팁 + 모바일 탭 토스트 안내. */}
              {onToggleMemory && (() => {
                const selected = selectedMemoryIds.includes(c.id);
                const tipText = selected
                  ? (lang === 'ko' ? '기억에서 제외' : 'Remove from memory')
                  : (lang === 'ko' ? '채팅 기억하기' : 'Remember this chat');
                return (
                  <div className="relative shrink-0 group/tip">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const wasSelected = selected;
                        onToggleMemory(c.id);
                        // 모바일/데스크톱 — 액션 토스트로 결과 확인
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('d1:toast', {
                            detail: wasSelected
                              ? (lang === 'ko' ? '기억에서 제외했어요' : 'Removed from memory')
                              : (lang === 'ko' ? '✓ 이 채팅을 기억할게요' : '✓ Remembering this chat'),
                          }));
                        }
                      }}
                      className="rounded-md p-1 transition-all hover:bg-black/5"
                      style={{
                        background: selected ? '#FEF3C7' : 'transparent',
                        color: selected ? '#854D0E' : tokens.textFaint,
                      }}
                      aria-label={tipText}
                    >
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill={selected ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ opacity: selected ? 1 : 0.45 }}
                        className="transition-opacity group-hover:!opacity-100"
                      >
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    <span
                      className="pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] opacity-0 transition-none group-hover/tip:opacity-100"
                      style={{ background: 'rgba(20,20,20,0.92)', color: '#fff' }}
                      role="tooltip"
                    >
                      {tipText}
                    </span>
                  </div>
                );
              })()}
              {/* P3.1 — 핀 토글 */}
              {onTogglePin && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTogglePin(c.id); }}
                  className="shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5"
                  title={c.pinned ? (lang === 'ko' ? '고정 해제' : 'Unpin') : (lang === 'ko' ? '고정' : 'Pin')}
                  aria-label={c.pinned ? 'unpin' : 'pin'}
                  style={{ color: c.pinned ? tokens.accent : tokens.textFaint }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill={c.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L9 9 2 9.75l5.5 5.25L6 22l6-3 6 3-1.5-7L22 9.75 15 9z" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                  className="shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5"
                  title={L.delete}
                  aria-label={L.delete}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: tokens.textFaint }}>
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  let cursor = 0;
  const todayStart     = cursor; cursor += groups.today.length;
  const yesterdayStart = cursor; cursor += groups.yesterday.length;
  const weekStart      = cursor; cursor += groups.week.length;
  const monthStart     = cursor; cursor += groups.month.length;
  const olderStart     = cursor;

  const fontFamily = lang === 'ko'
    ? '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif'
    : '"Geist", -apple-system, system-ui, sans-serif';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      style={{ fontFamily, animation: 'd1-fade 180ms ease both' }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(10,10,10,0.32)' }} onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-[720px] flex-col overflow-hidden rounded-[16px]"
        style={{
          background: tokens.surface,
          boxShadow: '0 24px 80px rgba(0,0,0,0.24)',
          maxHeight: '70vh',
          animation: 'd1-rise 240ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* [2026-05-02 Roy] 첫 1회 코치마크 — 채팅 행에 어떤 기능이 있는지 안내.
            4초 후 자동 사라지고 localStorage 가드로 영구 안 보임. */}
        {showCoachmark && (
          <div
            className="absolute right-4 top-[68px] z-20 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] shadow-lg"
            style={{
              background: '#FEF3C7',
              color: '#854D0E',
              border: '1px solid #FCD34D',
              animation: 'd1-rise 220ms ease-out both',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span>{lang === 'ko' ? '북마크 클릭 → 채팅 기억하기' : 'Click bookmark → remember chat'}</span>
            <button
              onClick={() => {
                setShowCoachmark(false);
                if (typeof window !== 'undefined') localStorage.setItem('d1:memory-coachmark-seen', 'true');
              }}
              aria-label="dismiss"
              className="ml-1 opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}
        {/* Search */}
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: tokens.border }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: tokens.textFaint }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
            placeholder={L.placeholder}
            className="flex-1 bg-transparent text-[15px] outline-none"
            style={{ color: tokens.text, fontFamily }}
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-black/5"
            aria-label="Close"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: tokens.textFaint }}>
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b px-3 py-2" style={{ borderColor: tokens.border }}>
          {([
            ['today', L.today, counts.today],
            ['week',  L.week,  counts.week],
            ['month', L.month, counts.month],
            ['all',   L.all,   counts.all],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => { setFilter(key as FilterRange); setHighlightIdx(0); }}
              className="rounded-full px-3 py-1 text-[12.5px] transition-colors"
              style={{
                background: filter === key ? tokens.text : 'transparent',
                color: filter === key ? tokens.bg : tokens.textDim,
              }}
            >
              {label}{count > 0 && <span className="opacity-60"> · {count}</span>}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[13px]" style={{ color: tokens.textFaint }}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <div className="mt-3">{chats.length === 0 ? L.emptyAll : L.empty}</div>
            </div>
          ) : (
            <>
              {renderGroup(L.groupToday,     groups.today,     todayStart)}
              {renderGroup(L.groupYesterday, groups.yesterday, yesterdayStart)}
              {renderGroup(L.groupWeek,      groups.week,      weekStart)}
              {renderGroup(L.groupMonth,     groups.month,     monthStart)}
              {renderGroup(L.groupOlder,     groups.older,     olderStart)}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-5 py-2 text-[11px]" style={{ borderColor: tokens.border, color: tokens.textFaint }}>
          {L.hint}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes d1-rise {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}} />
    </div>
  );
}
