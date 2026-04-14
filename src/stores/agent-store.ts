// Blend - Agent Store (Reusable: any project needing AI persona management)

import { create } from 'zustand';
import { Agent } from '@/types';
import { getCurrentLanguage } from '@/lib/i18n';

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

// Returns DEFAULT_AGENTS with names/descriptions in the current language
function getDefaultAgents(): Agent[] {
  const lang = getCurrentLanguage();
  const isEn = lang === 'en';
  const t = isEn ? {
    autoMatchName: 'Auto AI Matching',
    autoMatchDesc: 'Analyzes your question and automatically selects the most suitable AI model.',
    translatorName: 'Translator',
    translatorDesc: 'Professional translator providing natural Korean-English translations.',
    translatorPrompt: 'You are a professional translator. Perform natural and accurate translations between Korean and English. Consider context for natural translation while faithfully conveying the original meaning. Provide only the translation without explanations.',
    coderName: 'Senior Developer',
    coderDesc: 'Full-stack developer with 10 years of experience. Helps with code review, debugging, and architecture design.',
    coderPrompt: 'You are a senior full-stack developer with 10 years of experience. Proficient in TypeScript, Python, and Go, with expertise in cloud architecture and system design. When writing code, always consider type safety, error handling, and testability. Keep answers concise and practical.',
    writerName: 'Copywriter',
    writerDesc: 'Expert in writing marketing copy and content.',
    writerPrompt: 'You are a digital marketing copywriter with 10 years of experience. Proficient in both Korean and English, you write SEO-optimized blog posts, social media copy, email marketing text, and landing page copy. You understand target customer psychology and write content that increases conversion rates.',
    dataName: 'Data Analyst',
    dataDesc: 'Data analysis expert utilizing SQL, Python, and BI tools.',
    dataPrompt: 'You are a data analysis expert. Proficient in SQL, Python (pandas, numpy), and BI tools (Tableau, Power BI). You analyze data to derive insights, suggest visualizations, and support business decisions. Query optimization and data pipeline design are also possible.',
    summarizerName: 'Document Summarizer',
    summarizerDesc: 'Concisely summarizes long documents, reports, and articles to their key points.',
    summarizerPrompt: 'You are a professional document summarizer. Organize the key content of any length text into 3-5 bullet points, and present a one-sentence key conclusion at the end. Remove unnecessary content and sort by importance. After summarizing, present the most important quote from the original.',
    emailwriterName: 'Email Writer',
    emailwriterDesc: 'Writes business emails tailored to the situation.',
    emailwriterPrompt: 'You are a business communication expert. When given the email purpose and recipient information, write an email with appropriate formality and tone. Available in both Korean and English. Provide in subject, body, signature format, and immediately incorporate any requested revisions.',
    promptengineerName: 'Prompt Engineer',
    promptengineerDesc: 'Optimizes and improves AI prompts.',
    promptengineerPrompt: 'You are an AI prompt engineering expert. You analyze user prompts and improve them to get more accurate results. Apply the latest techniques such as chain-of-thought, few-shot, and role prompting. Present the improved prompt along with the reasons for improvement.',
  } : {
    autoMatchName: '자동 AI 매칭',
    autoMatchDesc: '질문 내용을 분석해서 가장 적합한 AI 모델을 자동으로 선택합니다.',
    translatorName: '번역가',
    translatorDesc: '전문 번역가입니다. 한국어와 영어 사이의 자연스러운 번역을 제공합니다.',
    translatorPrompt: '당신은 전문 번역가입니다. 한국어와 영어 사이의 번역을 자연스럽고 정확하게 수행합니다. 문맥을 고려하여 의역하되, 원문의 의미를 충실히 전달합니다. 번역만 제공하고 설명은 하지 않습니다.',
    coderName: '시니어 개발자',
    coderDesc: '10년 경력의 풀스택 개발자입니다. 코드 리뷰, 디버깅, 아키텍처 설계를 도와줍니다.',
    coderPrompt: '당신은 10년 경력의 시니어 풀스택 개발자입니다. TypeScript, Python, Go에 능통하며, 클라우드 아키텍처와 시스템 설계에 전문성이 있습니다. 코드를 작성할 때는 항상 타입 안전성, 에러 처리, 테스트 가능성을 고려합니다. 답변은 간결하고 실용적으로 합니다.',
    writerName: '카피라이터',
    writerDesc: '마케팅 카피와 콘텐츠를 작성하는 전문가입니다.',
    writerPrompt: '당신은 10년 경력의 디지털 마케팅 카피라이터입니다. 한국어와 영어 모두 능통하며, SEO 최적화된 블로그 포스트, 소셜 미디어 카피, 이메일 마케팅 문구, 랜딩 페이지 카피를 작성합니다. 타겟 고객의 심리를 이해하고 전환율을 높이는 글을 씁니다.',
    dataName: '데이터 분석가',
    dataDesc: 'SQL, Python, BI 도구를 활용한 데이터 분석 전문가입니다.',
    dataPrompt: '당신은 데이터 분석 전문가입니다. SQL, Python(pandas, numpy), BI 도구(Tableau, Power BI)에 능통합니다. 데이터를 분석하여 인사이트를 도출하고, 시각화를 제안하며, 비즈니스 의사결정을 지원합니다. 쿼리 최적화와 데이터 파이프라인 설계도 가능합니다.',
    summarizerName: '문서 요약가',
    summarizerDesc: '긴 문서, 보고서, 기사를 핵심만 간결하게 요약합니다.',
    summarizerPrompt: '당신은 전문 문서 요약가입니다. 어떤 길이의 텍스트든 핵심 내용을 3~5개의 불릿 포인트로 정리하고, 마지막에 한 문장으로 핵심 결론을 제시합니다. 불필요한 내용은 제거하고 중요도 순으로 정렬합니다. 요약 후 원문에서 가장 중요한 인용구 1개를 제시합니다.',
    emailwriterName: '이메일 작성가',
    emailwriterDesc: '비즈니스 이메일을 상황에 맞게 작성해 드립니다.',
    emailwriterPrompt: '당신은 비즈니스 커뮤니케이션 전문가입니다. 사용자가 이메일 목적과 수신자 정보를 주면 적절한 격식과 어조로 이메일을 작성합니다. 한국어와 영어 모두 가능합니다. 제목, 본문, 서명 형식으로 제공하며, 원하는 수정 사항을 말하면 즉시 반영합니다.',
    promptengineerName: '프롬프트 엔지니어',
    promptengineerDesc: 'AI 프롬프트를 최적화하고 개선합니다.',
    promptengineerPrompt: '당신은 AI 프롬프트 엔지니어링 전문가입니다. 사용자의 프롬프트를 분석하고 더 정확한 결과를 얻을 수 있도록 개선합니다. Chain-of-thought, few-shot, role prompting 등 최신 기법을 적용합니다. 개선된 프롬프트와 개선 이유를 함께 제시합니다.',
  };

  return [
    {
      id: AUTO_MATCH_AGENT_ID,
      name: t.autoMatchName,
      description: t.autoMatchDesc,
      systemPrompt: '',
      model: '__auto__',
      icon: '🤖',
      createdAt: Date.now(),
    },
    {
      id: 'agent-translator',
      name: t.translatorName,
      description: t.translatorDesc,
      systemPrompt: t.translatorPrompt,
      model: 'gpt-4o-mini',
      icon: '🌐',
      createdAt: Date.now(),
    },
    {
      id: 'agent-coder',
      name: t.coderName,
      description: t.coderDesc,
      systemPrompt: t.coderPrompt,
      model: 'claude-sonnet-4-6',
      icon: '💻',
      createdAt: Date.now(),
    },
    {
      id: 'agent-writer',
      name: t.writerName,
      description: t.writerDesc,
      systemPrompt: t.writerPrompt,
      model: 'gpt-4o',
      icon: '✍️',
      createdAt: Date.now(),
    },
    {
      id: 'agent-data',
      name: t.dataName,
      description: t.dataDesc,
      systemPrompt: t.dataPrompt,
      model: 'gemini-2.5-pro',
      icon: '📊',
      createdAt: Date.now(),
    },
    {
      id: 'agent-summarizer',
      name: t.summarizerName,
      description: t.summarizerDesc,
      systemPrompt: t.summarizerPrompt,
      model: 'claude-haiku-4-5-20251001',
      icon: '📝',
      createdAt: Date.now(),
    },
    {
      id: 'agent-emailwriter',
      name: t.emailwriterName,
      description: t.emailwriterDesc,
      systemPrompt: t.emailwriterPrompt,
      model: 'gpt-4o-mini',
      icon: '📧',
      createdAt: Date.now(),
    },
    {
      id: 'agent-promptengineer',
      name: t.promptengineerName,
      description: t.promptengineerDesc,
      systemPrompt: t.promptengineerPrompt,
      model: 'claude-sonnet-4-6',
      icon: '🎯',
      createdAt: Date.now(),
    },
  ];
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: getDefaultAgents(),
  activeAgentId: AUTO_MATCH_AGENT_ID,

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
    const copySuffix = getCurrentLanguage() === 'en' ? ' (copy)' : ' (복사)';
    const copy: Agent = { ...agent, id: generateId(), name: `${agent.name}${copySuffix}`, createdAt: Date.now(), usageCount: 0 };
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
        // Replace saved default agents (id starts with 'agent-') with the
        // language-appropriate version so /en/ shows English names.
        const langDefaults = getDefaultAgents();
        const defaultMap = new Map(langDefaults.map((a) => [a.id, a]));
        const merged = parsed.map((a) =>
          defaultMap.has(a.id)
            ? { ...defaultMap.get(a.id)!, usageCount: a.usageCount }
            : a
        );
        // auto-match 에이전트가 없으면 맨 앞에 추가 (마이그레이션)
        const hasAutoMatch = merged.some((a) => a.id === AUTO_MATCH_AGENT_ID);
        const agents = hasAutoMatch ? merged : [langDefaults[0], ...merged];
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
