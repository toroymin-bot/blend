'use client';

/**
 * D1SettingsView — Design1 설정 뷰 (Apple System Settings 스타일)
 *
 * 레이아웃: 좌측 앵커 내비게이션 7개 섹션 + 우측 콘텐츠
 * 섹션: API Keys · Custom Models · System Prompt · Theme · Language · Data · Info
 *
 * 삭제됨: About Blend 카드, Cost Alert 섹션
 * 보존됨: handleExport / handleImport / handleTestKey / handleClearAll /
 *          PROVIDERS 배열 / systemPromptPresets / customModels / URL 라우팅
 */

import { useState, useEffect, useRef } from 'react';
import { useAPIKeyStore }   from '@/stores/api-key-store';
import { useChatStore }     from '@/stores/chat-store';
import { usePromptStore }   from '@/stores/prompt-store';
import { useAgentStore }    from '@/stores/agent-store';
import { getImageModelByQuality, getImageModelLabel } from '@/data/available-models';
import { getVoiceModelLabel } from '@/lib/voice-chat';
import { useUsageStore }    from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { isAnalyticsDisabled, setAnalyticsDisabled } from '@/lib/analytics';
import { AIProvider }       from '@/types';
import { exportAllChatsAsJSON } from '@/modules/chat/export-chat';
// [2026-04-26] 16417054 — Full Backup IDB 통합 v2.0
import { downloadBackup, importBackup, clearAllData, getCounts, type BackupMeta } from '@/lib/full-backup';
import { useTranslation }   from '@/lib/i18n';
import { D1_PROVIDERS, API_GUIDE_STEPS_KEYS, getProviderModelsLabel } from '@/modules/shared/providers-design1';
// [2026-04-29 Tori 18841602 v2 P0] 모바일 콘텐츠 깨짐 수정 — 200px nav 가 mobile에서도
// 그대로 push 되어 우측 콘텐츠가 1-2글자 폭으로 잘리던 문제. deviceClass 분기로 해결.
import { useDeviceClass } from '@/hooks/use-device-class';

// ── Design tokens ─────────────────────────────────────────────────
const tokens = {
  bg:         '#fafaf9',
  text:       '#0a0a0a',
  textDim:    '#6b6862',
  textFaint:  '#a8a49b',
  border:     'rgba(10, 10, 10, 0.07)',
  borderMid:  'rgba(10, 10, 10, 0.12)',
  accent:     '#c65a3c',
  accentSoft: 'rgba(198, 90, 60, 0.09)',
  surface:    '#ffffff',
  navActive:  'rgba(10, 10, 10, 0.06)',
} as const;

// [2026-04-26] 16417054 — Roy 결정: Settings에서 Analytics 섹션 노출 X.
// Vercel Analytics 호출 코드 + 디폴트 ON은 그대로 유지. 향후 재활성화 시 true.
const SHOW_ANALYTICS_SECTION = false;

// ── Nav sections ──────────────────────────────────────────────────
// Roy 결정 2026-04-25: Theme 섹션 제거 (라이트 모드 only). 'theme' SectionId는 호환 유지.
// [2026-05-02 Roy] 'voice' 섹션 추가 — TTS 품질 변경.
// [2026-05-03 Roy] 'image' 섹션 추가 — 이미지 생성 품질(DALL-E 3 / GPT Image 2) 변경.
// [2026-05-04 Roy #16] 'info' 섹션을 'about'으로 통합. 사이드바 바깥 About 메뉴
// 제거 + 일관된 진입점으로 Settings → About만 사용. 'info'(버전 단일 행)는 about
// 안의 Version 블록으로 흡수 — 8 섹션 그대로 유지. 'info' SectionId는 호환 유지.
type SectionId = 'api' | 'models' | 'prompt' | 'theme' | 'analytics' | 'language' | 'voice' | 'image' | 'data' | 'info' | 'about';

const SECTIONS: { id: SectionId; labelKey: string }[] = [
  { id: 'api',      labelKey: 'settings.api_keys' },
  { id: 'models',   labelKey: 'settings.custom_models' },
  { id: 'prompt',   labelKey: 'settings.system_prompt' },
  { id: 'language', labelKey: 'settings.language' },
  { id: 'voice',    labelKey: 'settings.voice' },
  { id: 'image',    labelKey: 'settings.image' },
  { id: 'data',     labelKey: 'settings.data_storage' },
  { id: 'about',    labelKey: 'settings.about' },
];

// ── Inline SVG icons ──────────────────────────────────────────────
const ic = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function EyeIcon()        { return <svg {...ic}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>; }
function EyeOffIcon()     { return <svg {...ic}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>; }
function CheckIcon()      { return <svg {...ic}><polyline points="20 6 9 17 4 12"/></svg>; }
function XIcon()          { return <svg {...ic}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function ExternalIcon()   { return <svg {...ic}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>; }
function HelpIcon()       { return <svg {...ic}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function PlusIcon()       { return <svg {...ic}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function TrashIcon()      { return <svg {...ic}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function DownloadIcon()   { return <svg {...ic}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function UploadIcon()     { return <svg {...ic}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }
function BookmarkIcon()   { return <svg {...ic}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>; }
function SunIcon()        { return <svg {...ic}><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>; }
function MoonIcon()       { return <svg {...ic}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function GlobeIcon()      { return <svg {...ic}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>; }
function LoaderIcon()     { return <svg {...ic} className="animate-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>; }
function AlertIcon()      { return <svg {...ic}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }

// ── Shared card wrapper ───────────────────────────────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className ?? ''}`}
      style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
    >
      {children}
    </div>
  );
}

// ── Row inside a card ────────────────────────────────────────────
function Row({
  label, sub, right, noBorder,
}: {
  label: React.ReactNode; sub?: string; right?: React.ReactNode; noBorder?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3.5"
      style={{ borderBottom: noBorder ? 'none' : `1px solid ${tokens.border}` }}
    >
      <div className="min-w-0">
        <p className="text-[14px]" style={{ color: tokens.text }}>{label}</p>
        {sub && <p className="mt-0.5 text-[12px]" style={{ color: tokens.textFaint }}>{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────
function SectionH({ id, label }: { id: SectionId; label: string }) {
  return (
    <h2
      id={`section-${id}`}
      className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: tokens.textFaint }}
    >
      {label}
    </h2>
  );
}

// ══════════════════════════════════════════════════════════════════
export function D1SettingsView() {
  const { keys, setKey, loadFromStorage } = useAPIKeyStore();
  const chatStore    = useChatStore();
  const promptStore  = usePromptStore();
  const agentStore   = useAgentStore();
  const usageStore   = useUsageStore();
  const {
    systemPrompt, setSystemPrompt, settings, updateSettings,
    systemPromptPresets, addSystemPromptPreset, removeSystemPromptPreset,
    customModels, addCustomModel, removeCustomModel,
  } = useSettingsStore();
  const { t, lang, setLang } = useTranslation();

  // [2026-05-04 Roy] 모바일 진입은 무조건 메뉴 리스트(null)부터 — 사용자 보고:
  //   '설정 클릭하면 API 키 관리로 두 단계 점프되는 버그'.
  //   원인: 초기값 'api'가 첫 렌더에서 표시 → 'flash of API'. 첫마운트 보정 useEffect는
  //   deviceClass='unknown'(SSR 첫 클라 렌더)에서 mobile 판정 못 함 → 보정 누락.
  //   해결: SSR-safe하게 useState 초기값을 'api'로 두되, useEffect 내에서 mobile/unknown
  //   둘 다 null 보정 (즉 모바일 폭이거나 아직 미확정인 좁은 폭이면 메뉴 우선).
  //   firstMountRef로 user 클릭 후 리사이즈 시 의도된 'api'를 다시 null로 만들지 않도록 분리.
  const deviceClass = useDeviceClass();
  const [activeSection, setActiveSection] = useState<SectionId | null>('api');
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const firstMountRef = useRef(true);

  // 회전 / 리사이즈 처리.
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      // [2026-05-04 Roy] 첫 마운트: 모바일 폭이거나 좁은 viewport면 무조건 메뉴(null).
      // window.innerWidth로 직접 체크 — useDeviceClass가 'unknown' 반환하는 순간도 커버.
      const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
      if ((deviceClass === 'mobile' || isNarrow) && activeSection === 'api') {
        setActiveSection(null);
      }
      return;
    }
    // 이후 리사이즈: null/theme → api 정정만 수행 (사용자 의도된 'api'는 보존).
    if (deviceClass === 'desktop' || deviceClass === 'tablet') {
      if (activeSection === null || activeSection === 'theme') setActiveSection('api');
    }
    if (deviceClass === 'mobile' && activeSection === 'theme') setActiveSection('api');
    if (deviceClass === 'desktop') setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceClass]);

  // 'theme' 호환 redirect 보존 (legacy)
  useEffect(() => {
    if (activeSection === 'theme') setActiveSection('api');
  }, [activeSection]);

  // Esc → drawer 닫기 + mobile 백 (section → 메뉴)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (drawerOpen) setDrawerOpen(false);
      else if (deviceClass === 'mobile' && activeSection !== null) setActiveSection(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, deviceClass, activeSection]);
  const [showKeys,    setShowKeys]    = useState<Record<string, boolean>>({});
  const [testingKey,  setTestingKey]  = useState<Record<string, boolean>>({});
  const [testResult,  setTestResult]  = useState<Record<string, 'ok' | 'fail' | null>>({});
  const [guideProvider, setGuideProvider] = useState<string | null>(null);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName,  setPresetName]  = useState('');
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelId,   setNewModelId]   = useState('');
  const [newModelBaseUrl, setNewModelBaseUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadFromStorage(); }, []);

  // ── Handlers ──────────────────────────────────────────────────
  // [2026-04-26] 16417054 — Full Backup IDB 통합 v2.0 (PR #20/#21 회귀 수정)
  const handleExport = async () => {
    try {
      const meta = await downloadBackup();
      const summary = lang === 'ko'
        ? `백업 완료 — 채팅 ${meta.totalChats}개 · 메시지 ${meta.totalMessages}개 · 회의 ${meta.totalMeetings}개 · 문서 ${meta.totalDocuments}개`
        : `Backup complete — ${meta.totalChats} chats · ${meta.totalMessages} messages · ${meta.totalMeetings} meetings · ${meta.totalDocuments} docs`;
      alert(summary);
    } catch (e) {
      alert(`${t('settings.import_error')}: ${(e as Error).message}`);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const result = await importBackup(text);
      if (!result.ok) {
        alert(`${t('settings.import_error')}: ${result.error}`);
        return;
      }
      if (result.version === '2.0') {
        const meta = result.meta;
        const summary = lang === 'ko'
          ? `복원 완료 — 채팅 ${meta.totalChats}개 · 메시지 ${meta.totalMessages}개 · 회의 ${meta.totalMeetings}개 · 문서 ${meta.totalDocuments}개`
          : `Restore complete — ${meta.totalChats} chats · ${meta.totalMessages} messages · ${meta.totalMeetings} meetings · ${meta.totalDocuments} docs`;
        alert(summary);
      } else {
        // v1.0 legacy — localStorage만 복원
        if (typeof ev.target?.result === 'string') {
          try {
            const data = JSON.parse(ev.target.result);
            if (data.chats)   useChatStore.setState({ chats: data.chats });
            if (data.prompts) usePromptStore.setState({ prompts: data.prompts });
            if (data.agents)  useAgentStore.setState({ agents: data.agents });
            if (data.usage)   useUsageStore.setState({ records: data.usage });
          } catch { /* ignore — store 갱신은 best-effort */ }
        }
        alert(lang === 'ko'
          ? '복원 완료 — v1.0 백업 (구 버전 호환). 새로고침하면 변경사항 반영돼요.'
          : 'Restore complete — v1.0 backup (legacy). Refresh to see changes.');
      }
      // 새로고침으로 IDB-backed store들 다시 로드
      setTimeout(() => window.location.reload(), 500);
    };
    reader.readAsText(file);
  };

  const handleTestKey = async (providerId: AIProvider) => {
    const key = keys[providerId];
    if (!key) return;
    setTestingKey((s) => ({ ...s, [providerId]: true }));
    setTestResult((s) => ({ ...s, [providerId]: null }));
    try {
      let ok = false;
      if (providerId === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = res.ok;
      } else if (providerId === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        });
        ok = res.ok;
      } else if (providerId === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        ok = res.ok;
      } else if (providerId === 'deepseek') {
        const res = await fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = res.ok;
      } else if (providerId === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = res.ok;
      }
      setTestResult((s) => ({ ...s, [providerId]: ok ? 'ok' : 'fail' }));
    } catch {
      setTestResult((s) => ({ ...s, [providerId]: 'fail' }));
    } finally {
      setTestingKey((s) => ({ ...s, [providerId]: false }));
      setTimeout(() => setTestResult((s) => ({ ...s, [providerId]: null })), 4000);
    }
  };

  // [2026-04-26] 16417054 — IDB 11 테이블 + blend:* localStorage 모두 삭제. Vercel 등 외부 키 보존.
  const handleClearAll = async () => {
    let counts: BackupMeta;
    try {
      counts = await getCounts();
    } catch {
      counts = { totalChats: 0, totalMessages: 0, totalFiles: 0, totalImages: 0, totalDocuments: 0, totalMeetings: 0, totalDataSources: 0 };
    }
    const detail = lang === 'ko'
      ? `⚠️ 모든 데이터가 삭제됩니다.\n\n` +
        `· 채팅 ${counts.totalChats}개\n` +
        `· 메시지 ${counts.totalMessages}개\n` +
        `· 회의 ${counts.totalMeetings}개\n` +
        `· 문서 ${counts.totalDocuments}개\n` +
        `· 데이터소스 ${counts.totalDataSources}개\n\n` +
        `계속하시겠어요?`
      : `⚠️ All your data will be deleted.\n\n` +
        `· ${counts.totalChats} chats\n` +
        `· ${counts.totalMessages} messages\n` +
        `· ${counts.totalMeetings} meetings\n` +
        `· ${counts.totalDocuments} documents\n` +
        `· ${counts.totalDataSources} data sources\n\n` +
        `Continue?`;
    if (!confirm(detail)) return;
    try {
      await clearAllData();
    } catch (e) {
      alert(`Clear failed: ${(e as Error).message}`);
      return;
    }
    window.location.reload();
  };

  // ── Language routing (Design1-aware) ─────────────────────────
  const handleLangChange = (l: 'ko' | 'en') => {
    setLang(l);
    if (typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      if (parts[1] === 'design1') {
        // /design1/ko/ → /design1/en/
        const rest = parts.slice(3).join('/');
        window.location.href = `/design1/${l}/${rest ? rest + '/' : ''}`;
      } else if (parts[1] === 'ko' || parts[1] === 'en') {
        const rest = parts.slice(2).join('/');
        window.location.href = `/${l}/${rest ? rest + '/' : ''}`;
      }
    }
  };

  const guideData = guideProvider ? API_GUIDE_STEPS_KEYS[guideProvider] : null;
  const guideInfo = D1_PROVIDERS.find((p) => p.id === guideProvider);

  // [2026-04-29 v2] mobile drill-down 메뉴 모드 + tablet drawer + desktop 2-column 분기.
  const showInlineNav = deviceClass === 'desktop';
  const showHeader    = deviceClass !== 'desktop';
  // mobile에서 activeSection=null 이면 메뉴 화면, 그 외엔 섹션 콘텐츠.
  const showMobileMenu = deviceClass === 'mobile' && activeSection === null;
  const currentSectionLabel = SECTIONS.find((s) => s.id === activeSection)?.labelKey;

  // 각 섹션 가시 여부 — desktop은 전부, mobile/tablet은 activeSection 만.
  function visible(id: SectionId): boolean {
    return deviceClass === 'desktop' || activeSection === id;
  }

  function NavButtons({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setActiveSection(s.id);
              if (deviceClass === 'desktop') {
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
              onClick?.();
            }}
            className="w-full rounded-xl px-3 py-3 text-left text-[14px] font-medium transition-colors flex items-center justify-between gap-2"
            style={{
              background: activeSection === s.id ? tokens.navActive : 'transparent',
              color: activeSection === s.id ? tokens.text : tokens.textDim,
              minHeight: 48, // WCAG 2.1 모바일 터치 타겟
            }}
          >
            <span className="truncate">{t(s.labelKey)}</span>
            {/* mobile drill-down chevron */}
            {deviceClass === 'mobile' && activeSection === null && (
              <span aria-hidden style={{ color: tokens.textFaint }}>›</span>
            )}
          </button>
        ))}
      </>
    );
  }

  return (
    <div className={`h-full overflow-hidden ${showInlineNav ? 'flex' : 'flex flex-col'}`} style={{ background: tokens.bg }}>

      {/* ══ MOBILE/TABLET HEADER ══ */}
      {showHeader && (
        <div
          className="flex h-14 shrink-0 items-center gap-3 border-b px-3"
          style={{ borderColor: tokens.border }}
        >
          {showMobileMenu ? (
            <h1 className="text-[16px] font-semibold tracking-tight px-1" style={{ color: tokens.text }}>
              {t('settings.title')}
            </h1>
          ) : deviceClass === 'mobile' ? (
            <>
              {/* Mobile back to menu */}
              <button
                onClick={() => setActiveSection(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                aria-label="Back"
                style={{ color: tokens.text }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <h1 className="text-[15px] font-semibold tracking-tight truncate" style={{ color: tokens.text }}>
                {currentSectionLabel ? t(currentSectionLabel) : t('settings.title')}
              </h1>
            </>
          ) : (
            <>
              {/* Tablet hamburger */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                aria-label="Menu"
                style={{ color: tokens.text }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              </button>
              <h1 className="text-[15px] font-semibold tracking-tight truncate" style={{ color: tokens.text }}>
                {currentSectionLabel ? t(currentSectionLabel) : t('settings.title')}
              </h1>
            </>
          )}
        </div>
      )}

      {/* ══ MOBILE MENU MODE ══ */}
      {showMobileMenu && (
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
          <NavButtons />
        </div>
      )}

      {/* ══ TABLET DRAWER ══ */}
      {drawerOpen && deviceClass === 'tablet' && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute left-0 top-0 flex h-full w-[260px] flex-col gap-px overflow-y-auto border-r p-3"
            style={{
              background: tokens.bg,
              borderColor: tokens.border,
              animation: 'drawerSlide 220ms cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                {t('settings.title')}
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                style={{ color: tokens.textDim }}
                aria-label="Close"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <NavButtons onClick={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* ══ DESKTOP LEFT NAV (existing 2-column) ══ */}
      {showInlineNav && (
        <nav
          className="flex w-[200px] shrink-0 flex-col gap-px overflow-y-auto border-r px-3 py-6"
          style={{ borderColor: tokens.border }}
        >
          <h1 className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: tokens.textFaint }}>
            {t('settings.title')}
          </h1>
          <NavButtons />
        </nav>
      )}

      {/* ══ MAIN CONTENT ══ */}
      {!showMobileMenu && (
      <main className={`flex-1 overflow-y-auto ${deviceClass === 'mobile' ? 'px-4 py-4' : deviceClass === 'tablet' ? 'px-6 py-6' : 'px-8 py-8'}`}>
        <div className={`${deviceClass === 'desktop' ? 'max-w-[600px]' : 'w-full max-w-[600px]'} space-y-10`}>

          {/* ── 1. API Keys ─────────────────────────────────── */}
          <section style={{ display: visible('api') ? undefined : 'none' }}>
            <SectionH id="api" label={t('settings.api_keys')} />
            <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
              {t('settings.api_keys_desc')}
            </p>
            <div className="space-y-2">
              {D1_PROVIDERS.map((provider) => (
                <Card key={provider.id}>
                  {/* Header row */}
                  <div className="flex items-start justify-between px-5 py-4"
                       style={{ borderBottom: `1px solid ${tokens.border}` }}>
                    <div className="flex items-center gap-3">
                      <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: provider.color }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold" style={{ color: tokens.text }}>
                            {provider.name}
                          </span>
                          {provider.noteKey && (
                            <span className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                                  style={{ background: tokens.accentSoft, color: tokens.accent }}>
                              {t(provider.noteKey)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: tokens.textFaint }}>
                          {/* [2026-05-02 Roy] registry-derived 동적 라벨 — 3시간 cron이 새 모델
                              추가하면 자동 동기화. 이전 정적 'GPT-4o, GPT-4.1' 하드코딩 폐기. */}
                          {getProviderModelsLabel(provider.id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {keys[provider.id]
                        ? <span className="flex items-center gap-1 text-[12px]" style={{ color: '#22c55e' }}><CheckIcon /> {t('settings.key_set')}</span>
                        : <span className="flex items-center gap-1 text-[12px]" style={{ color: tokens.textFaint }}><XIcon /> {t('settings.key_not_set')}</span>
                      }
                    </div>
                  </div>

                  {/* Key input */}
                  <div className="flex items-center gap-2 px-5 py-3">
                    <input
                      type={showKeys[provider.id] ? 'text' : 'password'}
                      value={keys[provider.id] || ''}
                      onChange={(e) => {
                        setKey(provider.id, e.target.value);
                        setTestResult((s) => ({ ...s, [provider.id]: null }));
                      }}
                      placeholder={provider.placeholder}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      aria-label={`${provider.name} API key`}
                      className="flex-1 rounded-xl border px-3 py-2 font-mono text-[13px] outline-none transition-[border-color]"
                      style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = tokens.accent; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = tokens.borderMid; }}
                    />
                    <button
                      onClick={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                      className="p-2 transition-opacity hover:opacity-70"
                      style={{ color: tokens.textFaint }}
                      aria-label={showKeys[provider.id] ? t('settings.hide_key') : t('settings.show_key')}
                    >
                      {showKeys[provider.id] ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                    {keys[provider.id] && (
                      <button
                        onClick={() => handleTestKey(provider.id)}
                        disabled={testingKey[provider.id]}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
                        style={{
                          background: testResult[provider.id] === 'ok'   ? '#dcfce7'
                                    : testResult[provider.id] === 'fail' ? '#fee2e2'
                                    : tokens.accentSoft,
                          color: testResult[provider.id] === 'ok'   ? '#16a34a'
                               : testResult[provider.id] === 'fail' ? '#dc2626'
                               : tokens.accent,
                        }}
                      >
                        {testingKey[provider.id]            ? <LoaderIcon />
                         : testResult[provider.id] === 'ok'   ? <CheckIcon />
                         : testResult[provider.id] === 'fail' ? <AlertIcon />
                         : null}
                        {t('settings.test_key')}
                      </button>
                    )}
                  </div>

                  {/* Get key / guide */}
                  {!keys[provider.id] && (
                    <div className="flex items-center gap-4 px-5 pb-4">
                      <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
                         style={{ color: tokens.accent }}>
                        {t('settings.get_api_key')} <ExternalIcon />
                      </a>
                      <button onClick={() => setGuideProvider(provider.id)}
                              className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
                              style={{ color: tokens.textDim }}>
                        <HelpIcon /> {t('settings.how_to_get')}
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>

          {/* ── 2. Custom Models ──────────────────────────────── */}
          <section style={{ display: visible('models') ? undefined : 'none' }}>
            <SectionH id="models" label={t('settings.custom_models')} />
            <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
              {t('settings.custom_models_desc')}
            </p>

            {customModels.length > 0 && (
              <Card className="mb-3">
                {customModels.map((m, i) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-5 py-3.5"
                    style={{ borderBottom: i < customModels.length - 1 ? `1px solid ${tokens.border}` : 'none' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px]" style={{ color: tokens.text }}>{m.name}</p>
                      <p className="truncate text-[12px]" style={{ color: tokens.textFaint }}>
                        {m.baseUrl} · <code className="font-mono">{m.id.replace('custom-', '')}</code>
                      </p>
                    </div>
                    <button
                      onClick={() => removeCustomModel(m.id)}
                      className="shrink-0 p-1.5 transition-opacity hover:opacity-70"
                      style={{ color: tokens.textFaint }}
                      aria-label={`${t('settings.delete')} ${m.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </Card>
            )}

            {showAddModel ? (
              <Card>
                <div className="space-y-3 p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[12px]" style={{ color: tokens.textFaint }}>
                        {t('settings.display_name')}
                      </label>
                      <input type="text" value={newModelName} onChange={(e) => setNewModelName(e.target.value)}
                             placeholder="Llama 3.2"
                             className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                             style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px]" style={{ color: tokens.textFaint }}>
                        {t('settings.model_id')}
                      </label>
                      <input type="text" value={newModelId} onChange={(e) => setNewModelId(e.target.value)}
                             placeholder="llama3.2"
                             className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                             style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px]" style={{ color: tokens.textFaint }}>Base URL</label>
                    <input type="text" value={newModelBaseUrl} onChange={(e) => setNewModelBaseUrl(e.target.value)}
                           placeholder="http://localhost:11434/v1"
                           className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none"
                           style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }} />
                    <p className="mt-1 text-[11px]" style={{ color: tokens.textFaint }}>
                      Ollama: <code className="font-mono">http://localhost:11434/v1</code> · OpenRouter: <code className="font-mono">https://openrouter.ai/api/v1</code>
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (!newModelName.trim() || !newModelId.trim() || !newModelBaseUrl.trim()) return;
                        addCustomModel({ id: newModelId.trim(), name: newModelName.trim(), baseUrl: newModelBaseUrl.trim(), provider: 'custom', contextLength: 32000, inputPrice: 0, outputPrice: 0, features: ['streaming'] });
                        setNewModelName(''); setNewModelId(''); setNewModelBaseUrl(''); setShowAddModel(false);
                      }}
                      className="rounded-xl px-4 py-2 text-[13px] font-medium"
                      style={{ background: tokens.text, color: tokens.bg }}
                    >
                      {t('settings.add')}
                    </button>
                    <button onClick={() => { setShowAddModel(false); setNewModelName(''); setNewModelId(''); setNewModelBaseUrl(''); }}
                            className="rounded-xl px-4 py-2 text-[13px]"
                            style={{ background: tokens.navActive, color: tokens.textDim }}>
                      {t('settings.cancel')}
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => setShowAddModel(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-[13px] transition-opacity hover:opacity-70"
                style={{ borderColor: tokens.borderMid, color: tokens.textDim }}
              >
                <PlusIcon /> {t('settings.add_model')}
              </button>
            )}
          </section>

          {/* ── 3. System Prompt ──────────────────────────────── */}
          <section style={{ display: visible('prompt') ? undefined : 'none' }}>
            <SectionH id="prompt" label={t('settings.system_prompt')} />
            <Card>
              <div className="p-5 space-y-3">
                <p className="text-[13px]" style={{ color: tokens.textDim }}>
                  {t('settings.system_prompt_desc')}
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={t('settings.system_prompt_placeholder')}
                  rows={4}
                  className="w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] outline-none transition-[border-color]"
                  style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = tokens.accent; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = tokens.borderMid; }}
                />

                {/* Preset library */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: tokens.textFaint }}>
                      <BookmarkIcon /> {t('settings.preset_library')}
                    </span>
                    <button
                      onClick={() => { setShowSavePreset(true); setPresetName(''); }}
                      disabled={!systemPrompt.trim()}
                      className="flex items-center gap-0.5 text-[12px] transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ color: tokens.accent }}
                    >
                      <PlusIcon /> {t('settings.save_current')}
                    </button>
                  </div>

                  {showSavePreset && (
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        autoFocus type="text" value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && presetName.trim()) { addSystemPromptPreset(presetName.trim(), systemPrompt); setShowSavePreset(false); }
                          if (e.key === 'Escape') setShowSavePreset(false);
                        }}
                        placeholder={t('settings.preset_name_placeholder')}
                        className="flex-1 rounded-xl border px-2.5 py-1.5 text-[13px] outline-none"
                        style={{ borderColor: tokens.borderMid, background: 'transparent', color: tokens.text }}
                      />
                      <button
                        onClick={() => { if (presetName.trim()) { addSystemPromptPreset(presetName.trim(), systemPrompt); setShowSavePreset(false); } }}
                        className="rounded-xl px-3 py-1.5 text-[12px]"
                        style={{ background: tokens.text, color: tokens.bg }}
                      >{t('settings.save')}</button>
                      <button onClick={() => setShowSavePreset(false)} style={{ color: tokens.textFaint }}><XIcon /></button>
                    </div>
                  )}

                  {systemPromptPresets.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {systemPromptPresets.map((p) => (
                        <div key={p.id} className="group flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] transition-opacity hover:opacity-80"
                             style={{ background: tokens.navActive }}>
                          <button onClick={() => setSystemPrompt(p.content)} className="max-w-[120px] truncate"
                                  style={{ color: tokens.textDim }} title={p.content} aria-label={t('settings.apply_preset', { name: p.name })}>
                            {p.name}
                          </button>
                          <button onClick={() => removeSystemPromptPreset(p.id)}
                                  className="opacity-0 transition-opacity group-hover:opacity-100"
                                  style={{ color: tokens.textFaint }} aria-label={t('settings.delete_preset', { name: p.name })}>
                            <XIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !showSavePreset && <p className="text-[12px]" style={{ color: tokens.textFaint }}>{t('settings.no_presets')}</p>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* 4. Theme 섹션 폐기 (Roy 결정 2026-04-25) — 라이트 모드 only */}

          {/* ── 4b. Usage Analytics — [2026-04-26] 16417054 — UI에서 숨김 (코드 유지)
                Roy 결정: Vercel Analytics는 디폴트 ON, 사용자에게 옵트아웃 노출 X.
                재활성화 시 한 줄 변경: SHOW_ANALYTICS_SECTION = true. */}
          {SHOW_ANALYTICS_SECTION && <AnalyticsSection t={t} />}

          {/* ── 5. Language ───────────────────────────────────── */}
          <section style={{ display: visible('language') ? undefined : 'none' }}>
            <SectionH id="language" label={t('settings.language')} />
            <Card>
              <Row
                label={<span className="flex items-center gap-2"><GlobeIcon /> {t('settings.language')}</span>}
                sub={t('settings.language_desc')}
                right={
                  <div className="flex gap-2">
                    {(['ko', 'en'] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => handleLangChange(l)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
                        style={{
                          background: lang === l ? tokens.text : tokens.navActive,
                          color:      lang === l ? tokens.bg  : tokens.textDim,
                        }}
                      >
                        <span>{l === 'ko' ? '🇰🇷' : '🇺🇸'}</span>
                        <span>{l === 'ko' ? t('settings.language_ko') : t('settings.language_en')}</span>
                        {lang === l && <CheckIcon />}
                      </button>
                    ))}
                  </div>
                }
                noBorder
              />
            </Card>
          </section>

          {/* ── 5b. Voice (TTS quality) ─────────────────────────── */}
          {/* [2026-05-02 Roy] 음성 답변 품질 — '프리미엄' (Chirp3-HD) / '표준'
              (Neural2/OpenAI). localStorage 'd1:tts-quality'. */}
          <section style={{ display: visible('voice') ? undefined : 'none' }}>
            <SectionH id="voice" label={t('settings.voice')} />
            <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
              {t('settings.voice_desc')}
            </p>
            <D1VoiceQualitySelector lang={lang} t={t} />
          </section>

          {/* ── 5c. Image (Generation quality) ──────────────────── */}
          {/* [2026-05-03 Roy] 이미지 생성 품질 — '프리미엄' (GPT Image 2) / '표준'
              (DALL-E 3). localStorage 'd1:image-quality'. 첫 이미지 요청 시 모달로
              먼저 받지만, 변경은 이 섹션에서. 변경 시 d1:image-quality-changed 이벤트
              dispatch → chat-view가 즉시 반영. */}
          <section style={{ display: visible('image') ? undefined : 'none' }}>
            <SectionH id="image" label={t('settings.image')} />
            <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
              {t('settings.image_desc')}
            </p>
            <D1ImageQualitySelector lang={lang} t={t} />
          </section>

          {/* ── 6. Data ───────────────────────────────────────── */}
          <section style={{ display: visible('data') ? undefined : 'none' }}>
            <SectionH id="data" label={t('settings.data_storage')} />
            <Card>
              <div className="p-5">
                <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
                  {t('settings.data_storage_desc')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium"
                    style={{ background: tokens.text, color: tokens.bg }}
                  >
                    <DownloadIcon /> {t('settings.export_all')}
                  </button>
                  <button
                    onClick={() => exportAllChatsAsJSON(chatStore.chats)}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px]"
                    style={{ background: tokens.navActive, color: tokens.textDim }}
                    title={t('settings.export_chats_json')}
                  >
                    <DownloadIcon /> {t('settings.export_chats_json')}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px]"
                    style={{ background: tokens.navActive, color: tokens.textDim }}
                  >
                    <UploadIcon /> {t('settings.import')}
                  </button>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
                  <button
                    onClick={handleClearAll}
                    className="rounded-xl px-4 py-2 text-[13px]"
                    style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}
                  >
                    {t('settings.clear_all')}
                  </button>
                </div>
              </div>
            </Card>
          </section>

          {/* ── 7. About (구 Info 흡수) ──────────────────────── */}
          {/* [2026-05-04 Roy #16] About을 사이드바 바깥에서 Settings 안으로 통합. */}
          <section style={{ display: visible('about') ? undefined : 'none' }}>
            <SectionH id="about" label={t('settings.about')} />
            <Card>
              <div className="px-5 py-6">
                {/* Tagline */}
                <div className="mb-6">
                  <div
                    aria-hidden="true"
                    className="mb-2 text-[44px] leading-none"
                    style={{ color: tokens.text, fontFamily: '"Instrument Serif", serif', fontWeight: 400 }}
                  >
                    B
                  </div>
                  <h3 className="text-[20px] font-medium tracking-tight" style={{ color: tokens.text }}>Blend</h3>
                  <p className="mt-2 text-[13.5px]" style={{ color: tokens.textDim }}>
                    {lang === 'ko' ? 'AI들을 하나로, 더 저렴하게, 더 똑똑하게.' : 'One AI app — more affordable and smarter.'}
                  </p>
                </div>

                {/* Why we built */}
                <div className="mb-5">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '왜 만들었나' : 'Why we built this'}
                  </h4>
                  {lang === 'ko' ? (
                    <>
                      <p className="text-[13.5px] leading-[1.7]" style={{ color: tokens.text }}>매월 AI 구독료로 12만원을 쓰고 있었습니다.</p>
                      <p className="text-[13.5px] leading-[1.7]" style={{ color: tokens.text }}>이제는 월 12,000원이면 충분합니다.</p>
                      <p className="mt-1 text-[13.5px] font-medium leading-[1.7]" style={{ color: tokens.text }}>이게 Blend입니다.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13.5px] leading-[1.7]" style={{ color: tokens.text }}>We were spending $90 a month on AI subscriptions.</p>
                      <p className="text-[13.5px] leading-[1.7]" style={{ color: tokens.text }}>Now it&apos;s just $9 a month.</p>
                      <p className="mt-1 text-[13.5px] font-medium leading-[1.7]" style={{ color: tokens.text }}>That&apos;s Blend.</p>
                    </>
                  )}
                </div>

                {/* Made by */}
                <div className="mb-5">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '만든 곳' : 'Made by'}
                  </h4>
                  <p className="text-[13.5px]" style={{ color: tokens.text }}>MIN Company</p>
                </div>

                {/* Contact */}
                <div className="mb-5">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '연락' : 'Contact'}
                  </h4>
                  <a href="mailto:blend@ai4min.com" className="text-[13.5px]" style={{ color: tokens.accent }}>
                    blend@ai4min.com
                  </a>
                </div>

                {/* Version */}
                <div>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '버전' : 'Version'}
                  </h4>
                  <p className="text-[13.5px]" style={{ color: tokens.textDim }}>
                    {process.env.NEXT_PUBLIC_BUILD_VERSION || 'v0.9.x'} · {process.env.NEXT_PUBLIC_BUILD_DATE || '2026-05-04'}
                  </p>
                </div>
              </div>
            </Card>
          </section>

        </div>
      </main>
      )}

      {/* ══ API Key Guide Modal — [2026-04-26] 5개 프로바이더 디자인 통일 ══ */}
      {guideProvider && guideData && guideInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGuideProvider(null)} />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl"
               style={{ background: tokens.surface, border: `1px solid ${tokens.borderMid}`, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Header */}
            <div className="flex items-start justify-between border-b px-5 py-4"
                 style={{ borderColor: tokens.border }}>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wide" style={{ color: tokens.textFaint }}>
                  {t('settings.api_guide_title')}
                </p>
                <h2 className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold" style={{ color: tokens.text }}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: guideInfo.color }} />
                  {guideInfo.name}
                </h2>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                     style={{
                       background:
                         guideInfo.cost === 'free'  ? '#dcfce7' :
                         guideInfo.cost === 'trial' ? '#fef3c7' : '#fee2e2',
                       color:
                         guideInfo.cost === 'free'  ? '#166534' :
                         guideInfo.cost === 'trial' ? '#92400e' : '#991b1b',
                     }}>
                  <span>{guideInfo.cost === 'free' ? '🟢' : guideInfo.cost === 'trial' ? '🟡' : '🔴'}</span>
                  <span>
                    {guideInfo.cost === 'free'  ? t('settings.cost_free')  :
                     guideInfo.cost === 'trial' ? t('settings.cost_trial') :
                                                  t('settings.cost_paid')}
                  </span>
                </div>
              </div>
              <button onClick={() => setGuideProvider(null)} className="p-1" style={{ color: tokens.textFaint }}>
                <XIcon />
              </button>
            </div>
            {/* Steps — 단계 원형(burnt sienna) + 텍스트만, emoji 제거 */}
            <div className="space-y-3.5 px-5 py-5">
              {guideData.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                       style={{ background: tokens.accent, color: '#fff' }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-[13px] font-medium leading-tight" style={{ color: tokens.text }}>
                      {t(step.titleKey)}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-[1.5]" style={{ color: tokens.textDim }}>
                      {t(step.descKey)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div className="px-5 pb-5">
              <a
                href={guideInfo.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80"
                style={{ background: tokens.text, color: tokens.bg }}
              >
                {t('settings.go_to_site')} <ExternalIcon />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// D1VoiceQualitySelector — TTS 품질 선택 (2026-05-02 Roy)
// localStorage 'd1:tts-quality'에 저장. 첫 사용 모달에서도 같은 키 갱신.
// ════════════════════════════════════════════════════════════════
function D1VoiceQualitySelector({ lang, t }: { lang: 'ko' | 'en'; t: (k: string) => string }) {
  const [quality, setQuality] = useState<'premium' | 'standard'>('standard');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('d1:tts-quality');
    if (stored === 'premium' || stored === 'standard') setQuality(stored);
  }, []);
  function pick(q: 'premium' | 'standard') {
    setQuality(q);
    if (typeof window !== 'undefined') {
      localStorage.setItem('d1:tts-quality', q);
      localStorage.setItem('d1:tts-quality-chosen', 'true');
    }
  }
  void lang;
  // [2026-05-03 Roy Fully Agentic] {{voice_model}} placeholder를 voice-chat.ts의
  // 가족 상수 기반 라벨로 치환. Google이 Chirp4-HD 출시 시 PREMIUM_VOICE_FAMILY
  // 한 줄만 바꾸면 카드 카피도 자동 갱신.
  const labelByQ = {
    standard: getVoiceModelLabel('standard'),
    premium:  getVoiceModelLabel('premium'),
  };
  return (
    <Card>
      <div className="flex flex-col gap-2 p-4">
        {(['standard', 'premium'] as const).map((q) => (
          <button
            key={q}
            onClick={() => pick(q)}
            className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
            style={{
              background: quality === q ? tokens.accentSoft : 'transparent',
              borderColor: quality === q ? tokens.accent : tokens.borderMid,
            }}
          >
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2"
                 style={{ borderColor: quality === q ? tokens.accent : tokens.borderMid, background: quality === q ? tokens.accent : 'transparent' }} />
            <div className="flex flex-col">
              <span className="text-[14px] font-medium" style={{ color: tokens.text }}>
                {t(`settings.voice_quality_${q}`)}
              </span>
              <span className="mt-0.5 text-[12.5px]" style={{ color: tokens.textDim }}>
                {t(`settings.voice_quality_${q}_desc`).replace('{{voice_model}}', labelByQ[q])}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// D1ImageQualitySelector — 이미지 생성 품질 선택 (2026-05-03 Roy)
// localStorage 'd1:image-quality'. 변경 시 d1:image-quality-changed 이벤트
// dispatch — chat-view가 즉시 state 갱신. (TTS와 같은 패턴)
// [2026-05-03 Roy Agentic] {{model}} placeholder를 registry-derived 라벨로 치환 →
// 신모델(gpt-image-3 등) 출시 시 카피 자동 갱신. 카드 하단에 현재 사용 모델 표시 + 'auto-updated' 안내.
// ════════════════════════════════════════════════════════════════
function D1ImageQualitySelector({ lang, t }: { lang: 'ko' | 'en'; t: (k: string) => string }) {
  const [quality, setQuality] = useState<'premium' | 'standard'>('standard');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('d1:image-quality');
    if (stored === 'premium' || stored === 'standard') setQuality(stored);
  }, []);
  function pick(q: 'premium' | 'standard') {
    setQuality(q);
    if (typeof window !== 'undefined') {
      localStorage.setItem('d1:image-quality', q);
      localStorage.setItem('d1:image-quality-chosen', 'true');
      // chat-view가 즉시 반영 (모달 다시 안 띄우게)
      window.dispatchEvent(new CustomEvent('d1:image-quality-changed', { detail: { quality: q } }));
    }
  }
  // registry에서 현재 standard/premium에 매칭되는 실제 모델 라벨 도출.
  // cron(3시간 주기)으로 새 모델 추가되면 다음 사용 시 자동 적용.
  const standardLabel = getImageModelLabel(getImageModelByQuality('standard'), lang);
  const premiumLabel  = getImageModelLabel(getImageModelByQuality('premium'),  lang);
  const labelByQ = { standard: standardLabel, premium: premiumLabel };
  return (
    <Card>
      <div className="flex flex-col gap-2 p-4">
        {(['standard', 'premium'] as const).map((q) => (
          <button
            key={q}
            onClick={() => pick(q)}
            className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors"
            style={{
              background: quality === q ? tokens.accentSoft : 'transparent',
              borderColor: quality === q ? tokens.accent : tokens.borderMid,
            }}
          >
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2"
                 style={{ borderColor: quality === q ? tokens.accent : tokens.borderMid, background: quality === q ? tokens.accent : 'transparent' }} />
            <div className="flex flex-col">
              <span className="text-[14px] font-medium" style={{ color: tokens.text }}>
                {t(`settings.image_quality_${q}`)}
              </span>
              <span className="mt-0.5 text-[12.5px]" style={{ color: tokens.textDim }}>
                {/* {{model}} placeholder를 registry 라벨로 치환 */}
                {t(`settings.image_quality_${q}_desc`).replace('{{model}}', labelByQ[q])}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// AnalyticsSection — Tori 명세 (Vercel Analytics 옵트아웃)
// ════════════════════════════════════════════════════════════════
function AnalyticsSection({ t }: { t: (k: string) => string }) {
  const [disabled, setDisabled] = useState(false);
  useEffect(() => { setDisabled(isAnalyticsDisabled()); }, []);
  function toggle(checked: boolean) {
    setAnalyticsDisabled(!checked);
    setDisabled(!checked);
  }
  return (
    <section>
      <SectionH id="analytics" label={t('settings.analytics') || '사용 통계'} />
      <Card>
        <Row
          label={t('settings.analytics_collect') || '익명 사용 통계 수집'}
          sub={t('settings.analytics_desc') || '메뉴 사용 빈도만 익명으로 측정. 대화 내용·IP 미수집. Vercel Analytics 30일 자동 삭제.'}
          right={
            <button
              type="button"
              role="switch"
              aria-checked={!disabled}
              aria-label="Analytics toggle"
              onClick={() => toggle(disabled)}
              className="relative h-5 w-9 rounded-full transition-colors"
              style={{
                background: disabled ? 'var(--d1-border-strong)' : 'var(--d1-accent)',
              }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                style={{ transform: disabled ? 'translateX(2px)' : 'translateX(18px)' }}
              />
            </button>
          }
          noBorder
        />
      </Card>
    </section>
  );
}

// ThemeSection 폐기 (Roy 결정 2026-04-25) — 라이트 모드 only.
// useThemeStore는 호환을 위해 보존되어 있으나 mode='light' 고정.
