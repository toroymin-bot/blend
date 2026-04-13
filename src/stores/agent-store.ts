// Blend - Agent Store (Reusable: any project needing AI persona management)

import { create } from 'zustand';
import { Agent } from '@/types';

interface AgentState {
  agents: Agent[];
  activeAgentId: string | null;

  addAgent: (agent: Omit<Agent, 'id' | 'createdAt'>) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  duplicateAgent: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
  incrementUsage: (id: string) => void;
  getActiveAgent: () => Agent | undefined;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

export const AUTO_MATCH_AGENT_ID = 'agent-auto-match';

const DEFAULT_AGENTS: Agent[] = [
  // ── 자동 AI 매칭 (기본 에이전트) ─────────────────────────────────────────
  {
    id: AUTO_MATCH_AGENT_ID,
    name: '자동 AI 매칭',
    description: '질문 내용을 분석해서 가장 적합한 AI 모델을 자동으로 선택합니다.',
    systemPrompt: '',  // 시스템 프롬프트 없음 — 순수 모델 라우팅만
    model: '__auto__', // 내부 신호: 자동 선택 모드
    icon: '🤖',
    createdAt: Date.now(),
  },
  {
    id: 'agent-translator',
    name: '번역가',
    description: '전문 번역가입니다. 한국어와 영어 사이의 자연스러운 번역을 제공합니다.',
    systemPrompt: '당신은 전문 번역가입니다. 한국어와 영어 사이의 번역을 자연스럽고 정확하게 수행합니다. 문맥을 고려하여 의역하되, 원문의 의미를 충실히 전달합니다. 번역만 제공하고 설명은 하지 않습니다.',
    model: 'gpt-4o-mini',
    icon: '🌐',
    createdAt: Date.now(),
  },
  {
    id: 'agent-coder',
    name: '시니어 개발자',
    description: '10년 경력의 풀스택 개발자입니다. 코드 리뷰, 디버깅, 아키텍처 설계를 도와줍니다.',
    systemPrompt: '당신은 10년 경력의 시니어 풀스택 개발자입니다. TypeScript, Python, Go에 능통하며, 클라우드 아키텍처와 시스템 설계에 전문성이 있습니다. 코드를 작성할 때는 항상 타입 안전성, 에러 처리, 테스트 가능성을 고려합니다. 답변은 간결하고 실용적으로 합니다.',
    model: 'claude-sonnet-4-6',
    icon: '💻',
    createdAt: Date.now(),
  },
  {
    id: 'agent-writer',
    name: '카피라이터',
    description: '마케팅 카피와 콘텐츠를 작성하는 전문가입니다.',
    systemPrompt: '당신은 10년 경력의 디지털 마케팅 카피라이터입니다. 한국어와 영어 모두 능통하며, SEO 최적화된 블로그 포스트, 소셜 미디어 카피, 이메일 마케팅 문구, 랜딩 페이지 카피를 작성합니다. 타겟 고객의 심리를 이해하고 전환율을 높이는 글을 씁니다.',
    model: 'gpt-4o',
    icon: '✍️',
    createdAt: Date.now(),
  },
  {
    id: 'agent-data',
    name: '데이터 분석가',
    description: 'SQL, Python, BI 도구를 활용한 데이터 분석 전문가입니다.',
    systemPrompt: '당신은 데이터 분석 전문가입니다. SQL, Python(pandas, numpy), BI 도구(Tableau, Power BI)에 능통합니다. 데이터를 분석하여 인사이트를 도출하고, 시각화를 제안하며, 비즈니스 의사결정을 지원합니다. 쿼리 최적화와 데이터 파이프라인 설계도 가능합니다.',
    model: 'gemini-2.5-pro',
    icon: '📊',
    createdAt: Date.now(),
  },
  {
    id: 'agent-summarizer',
    name: '문서 요약가',
    description: '긴 문서, 보고서, 기사를 핵심만 간결하게 요약합니다.',
    systemPrompt: '당신은 전문 문서 요약가입니다. 어떤 길이의 텍스트든 핵심 내용을 3~5개의 불릿 포인트로 정리하고, 마지막에 한 문장으로 핵심 결론을 제시합니다. 불필요한 내용은 제거하고 중요도 순으로 정렬합니다. 요약 후 원문에서 가장 중요한 인용구 1개를 제시합니다.',
    model: 'claude-haiku-4-5-20251001',
    icon: '📝',
    createdAt: Date.now(),
  },
  {
    id: 'agent-emailwriter',
    name: '이메일 작성가',
    description: '비즈니스 이메일을 상황에 맞게 작성해 드립니다.',
    systemPrompt: '당신은 비즈니스 커뮤니케이션 전문가입니다. 사용자가 이메일 목적과 수신자 정보를 주면 적절한 격식과 어조로 이메일을 작성합니다. 한국어와 영어 모두 가능합니다. 제목, 본문, 서명 형식으로 제공하며, 원하는 수정 사항을 말하면 즉시 반영합니다.',
    model: 'gpt-4o-mini',
    icon: '📧',
    createdAt: Date.now(),
  },
  {
    id: 'agent-promptengineer',
    name: '프롬프트 엔지니어',
    description: 'AI 프롬프트를 최적화하고 개선합니다.',
    systemPrompt: '당신은 AI 프롬프트 엔지니어링 전문가입니다. 사용자의 프롬프트를 분석하고 더 정확한 결과를 얻을 수 있도록 개선합니다. Chain-of-thought, few-shot, role prompting 등 최신 기법을 적용합니다. 개선된 프롬프트와 개선 이유를 함께 제시합니다.',
    model: 'claude-sonnet-4-6',
    icon: '🎯',
    createdAt: Date.now(),
  },
];

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: DEFAULT_AGENTS,
  activeAgentId: AUTO_MATCH_AGENT_ID, // 기본: 자동 AI 매칭

  addAgent: (agent) => {
    const newAgent: Agent = { ...agent, id: generateId(), createdAt: Date.now() };
    set((state) => ({ agents: [...state.agents, newAgent] }));
    get().saveToStorage();
  },

  updateAgent: (id, updates) => {
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    get().saveToStorage();
  },

  deleteAgent: (id) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
    }));
    get().saveToStorage();
  },

  duplicateAgent: (id) => {
    const agent = get().agents.find((a) => a.id === id);
    if (!agent) return;
    const copy: Agent = { ...agent, id: generateId(), name: `${agent.name} (복사)`, createdAt: Date.now(), usageCount: 0 };
    set((state) => ({ agents: [...state.agents, copy] }));
    get().saveToStorage();
  },

  setActiveAgent: (id) => {
    set({ activeAgentId: id });
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('blend:activeAgentId', id);
      else localStorage.removeItem('blend:activeAgentId');
    }
  },

  incrementUsage: (id) => {
    set((state) => ({
      agents: state.agents.map((a) => a.id === id ? { ...a, usageCount: (a.usageCount ?? 0) + 1 } : a),
    }));
    get().saveToStorage();
  },

  getActiveAgent: () => {
    const { agents, activeAgentId } = get();
    return agents.find((a) => a.id === activeAgentId);
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:agents');
      const storedActive = localStorage.getItem('blend:activeAgentId');
      if (stored) {
        const parsed: Agent[] = JSON.parse(stored);
        // auto-match 에이전트가 없으면 맨 앞에 추가 (마이그레이션)
        const hasAutoMatch = parsed.some((a) => a.id === AUTO_MATCH_AGENT_ID);
        const agents = hasAutoMatch ? parsed : [DEFAULT_AGENTS[0], ...parsed];
        set({ agents });
      }
      if (storedActive) set({ activeAgentId: storedActive });
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { agents, activeAgentId } = get();
    localStorage.setItem('blend:agents', JSON.stringify(agents));
    if (activeAgentId) localStorage.setItem('blend:activeAgentId', activeAgentId);
    else localStorage.removeItem('blend:activeAgentId');
  },
}));
