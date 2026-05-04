/**
 * Blend Projects — 채팅 그룹화 (가벼운 라벨 방식).
 *
 * 의도적으로 가벼움 — 클로드 프로젝트와 달리 시스템 프롬프트/지식 파일 없음.
 * 그저 채팅을 묶는 컬러 라벨. Phase 2에서 시스템 프롬프트 등 확장 가능.
 *
 * 데이터 모델:
 *   - Project: { id, name, color, createdAt }
 *   - Chat → projectId 는 d1-chat-store의 기존 `folder` 필드 재사용 (setChatFolder 액션 이미 존재)
 *   - 활성 프로젝트(activeProjectId): 사이드바 셀렉터 현재 선택. 'all' = 필터 없음.
 *     새 채팅 시작 시 자동으로 이 값으로 folder 세팅.
 *
 * 저장: localStorage `blend:projects` (배열) + `blend:active-project` (string).
 */

import { create } from 'zustand';
import { safeSetItem } from '@/lib/safe-storage';

export interface Project {
  id: string;
  name: string;
  /** 컬러 인덱스 (PROJECT_COLORS 배열 인덱스) */
  colorIdx: number;
  createdAt: number;
}

/** 8가지 프리셋 — 채팅 카드 좌측 컬러 점에 사용. 프로젝트 만들 때 자동 순환 할당. */
export const PROJECT_COLORS = [
  '#c65a3c', // accent (red-orange)
  '#10a37f', // green (openai)
  '#4285f4', // blue (google)
  '#d97757', // anthropic orange
  '#4B5EFC', // deep blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
] as const;

const STORAGE_KEY_PROJECTS = 'blend:projects';
const STORAGE_KEY_ACTIVE = 'blend:active-project';

/** 'all' = 모든 채팅 표시 (필터 없음). 그 외엔 Project.id. */
export type ActiveProject = 'all' | string;

interface ProjectStoreState {
  projects: Project[];
  activeProjectId: ActiveProject;
  loaded: boolean;

  loadFromStorage: () => void;

  createProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: ActiveProject) => void;

  /** 컬러 헥스 헬퍼 — id로 조회 (없으면 미지정 회색 반환). */
  getColor: (projectId: string | null | undefined) => string;
  /** 프로젝트 이름 헬퍼 — id로 조회 (없으면 빈 문자열). */
  getName: (projectId: string | null | undefined) => string;
}

const UNASSIGNED_COLOR = '#cbd5e1'; // slate-300 — 프로젝트 미지정 채팅의 기본 점 색상

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function persistProjects(projects: Project[]) {
  if (typeof window === 'undefined') return;
  safeSetItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects), 'projects');
}

function persistActive(active: ActiveProject) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE, active);
  } catch {
    // quota 초과는 projects 본체보다 훨씬 작아 사실상 발생 X
  }
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  activeProjectId: 'all',
  loaded: false,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
      const projects: Project[] = raw ? JSON.parse(raw) : [];
      const active = (localStorage.getItem(STORAGE_KEY_ACTIVE) as ActiveProject | null) ?? 'all';
      // 활성 ID가 더 이상 존재하지 않는 프로젝트면 'all'로 fallback
      const valid = active === 'all' || projects.some((p) => p.id === active);
      set({ projects, activeProjectId: valid ? active : 'all', loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  createProject: (name) => {
    const trimmed = name.trim();
    const project: Project = {
      id: genId(),
      name: trimmed || '새 프로젝트',
      colorIdx: get().projects.length % PROJECT_COLORS.length,
      createdAt: Date.now(),
    };
    set((state) => {
      const next = [...state.projects, project];
      persistProjects(next);
      return { projects: next };
    });
    return project;
  },

  renameProject: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => {
      const next = state.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
      persistProjects(next);
      return { projects: next };
    });
  },

  deleteProject: (id) => {
    set((state) => {
      const next = state.projects.filter((p) => p.id !== id);
      persistProjects(next);
      // 삭제된 프로젝트가 활성이면 'all'로 되돌림. 채팅의 folder 값은 그대로 두어
      // (orphan), 사용자가 나중에 다시 다른 프로젝트로 이동시킬 수 있게 한다.
      const nextActive: ActiveProject = state.activeProjectId === id ? 'all' : state.activeProjectId;
      if (nextActive !== state.activeProjectId) persistActive(nextActive);
      return { projects: next, activeProjectId: nextActive };
    });
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
    persistActive(id);
  },

  getColor: (projectId) => {
    if (!projectId) return UNASSIGNED_COLOR;
    const p = get().projects.find((x) => x.id === projectId);
    if (!p) return UNASSIGNED_COLOR;
    return PROJECT_COLORS[p.colorIdx % PROJECT_COLORS.length];
  },

  getName: (projectId) => {
    if (!projectId) return '';
    return get().projects.find((x) => x.id === projectId)?.name ?? '';
  },
}));
