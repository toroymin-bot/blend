// Blend - Prompt Store (Reusable: any project needing prompt templates)

import { create } from 'zustand';
import { Prompt } from '@/types';
import { getCurrentLanguage } from '@/lib/i18n';

interface PromptState {
  prompts: Prompt[];
  searchQuery: string;
  selectedTag: string | null;

  addPrompt: (prompt: Omit<Prompt, 'id' | 'createdAt'>) => void;
  updatePrompt: (id: string, updates: Partial<Prompt>) => void;
  deletePrompt: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  getFilteredPrompts: () => Prompt[];
  getAllTags: () => string[];
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

function getDefaultPrompts(): Prompt[] {
  const isEn = getCurrentLanguage() === 'en';
  const now = Date.now();
  if (isEn) {
    return [
      {
        id: 'default-1',
        title: 'Korean Translation',
        description: 'Translate English or other languages into natural Korean',
        content: 'Please translate the following text into natural Korean:\n\n{{text}}',
        tags: ['translation', 'korean'],
        variables: ['text'],
        isFavorite: true,
        createdAt: now,
      },
      {
        id: 'default-2',
        title: 'Code Review',
        description: 'Find issues in your code and suggest improvements',
        content: 'Please review the following code. Check for bugs, performance issues, and security vulnerabilities and suggest improvements:\n\n```{{language}}\n{{code}}\n```',
        tags: ['dev', 'code-review'],
        variables: ['language', 'code'],
        isFavorite: true,
        createdAt: now,
      },
      {
        id: 'default-3',
        title: 'Email Writing',
        description: 'Write a business email for any situation',
        content: 'Please write a business email for the following situation:\n\nRecipient: {{recipient}}\nPurpose: {{purpose}}\nTone: {{tone}}\n\nKey points:\n{{content}}',
        tags: ['business', 'email'],
        variables: ['recipient', 'purpose', 'tone', 'content'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-4',
        title: 'Summarize',
        description: 'Condense long text to its key points',
        content: 'Please summarize the following text in {{length}}. Organize key points as bullet points:\n\n{{text}}',
        tags: ['summary', 'productivity'],
        variables: ['length', 'text'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-5',
        title: 'SQL Query',
        description: 'Generate SQL queries for your database needs',
        content: 'Please write a SQL query for the following requirements:\n\nDatabase: {{db_type}}\nTables: {{tables}}\nRequirements: {{requirement}}',
        tags: ['dev', 'SQL', 'data'],
        variables: ['db_type', 'tables', 'requirement'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-6',
        title: 'Blog Post',
        description: 'Write an SEO-optimized blog post on any topic',
        content: 'Please write an SEO-optimized blog post on the following topic:\n\nTopic: {{topic}}\nTarget audience: {{audience}}\nKeywords: {{keywords}}\nLength: {{length}}\n\nStructure: title, subheadings, body, conclusion.',
        tags: ['content', 'blog', 'marketing'],
        variables: ['topic', 'audience', 'keywords', 'length'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-7',
        title: 'Meeting Notes',
        description: 'Turn meeting discussion into structured notes',
        content: 'Please write structured meeting minutes based on the following:\n\n{{meeting_notes}}\n\nFormat:\n- Attendees\n- Key discussion points\n- Decisions made\n- Action items by owner\n- Next meeting schedule',
        tags: ['business', 'meeting', 'productivity'],
        variables: ['meeting_notes'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-8',
        title: 'Brainstorming',
        description: 'Generate 10 creative ideas on any topic',
        content: 'Please suggest 10 creative ideas on the following topic:\n\nTopic: {{topic}}\nConstraints: {{constraints}}\n\nFor each idea, provide a brief description and feasibility assessment.',
        tags: ['creativity', 'ideas', 'planning'],
        variables: ['topic', 'constraints'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-9',
        title: 'English Resume',
        description: 'Write a professional English resume for job applications',
        content: 'Please write a professional English resume based on the following:\n\nName: {{name}}\nPosition: {{position}}\nExperience: {{experience}}\nSkills: {{skills}}\nEducation: {{education}}',
        tags: ['career', 'resume', 'english'],
        variables: ['name', 'position', 'experience', 'skills', 'education'],
        isFavorite: false,
        createdAt: now,
      },
      {
        id: 'default-10',
        title: 'Debug Error',
        description: 'Explain error messages and provide solutions',
        content: 'Please analyze the following error message and provide solutions:\n\n```\n{{error_message}}\n```\n\n1. Explanation of the error\n2. Immediate fix\n3. Recommendations to prevent recurrence',
        tags: ['dev', 'debugging', 'problem-solving'],
        variables: ['error_message'],
        isFavorite: false,
        createdAt: now,
      },
    ];
  }
  return [
    {
      id: 'default-1',
      title: '한국어 번역',
      description: '영어나 다른 언어를 자연스러운 한국어로 바꿔줘요',
      content: '다음 텍스트를 자연스러운 한국어로 번역해주세요:\n\n{{text}}',
      tags: ['번역', '한국어'],
      variables: ['text'],
      isFavorite: true,
      createdAt: now,
    },
    {
      id: 'default-2',
      title: '코드 리뷰',
      description: '내가 짠 코드에서 문제점을 찾아 고쳐줘요',
      content: '다음 코드를 리뷰해주세요. 버그, 성능 이슈, 보안 취약점을 확인하고 개선안을 제시해주세요:\n\n```{{language}}\n{{code}}\n```',
      tags: ['개발', '코드리뷰'],
      variables: ['language', 'code'],
      isFavorite: true,
      createdAt: now,
    },
    {
      id: 'default-3',
      title: '이메일 작성',
      description: '상황에 맞는 이메일을 대신 써줘요',
      content: '다음 상황에 맞는 비즈니스 이메일을 작성해주세요:\n\n수신자: {{recipient}}\n목적: {{purpose}}\n톤: {{tone}}\n\n핵심 내용:\n{{content}}',
      tags: ['비즈니스', '이메일'],
      variables: ['recipient', 'purpose', 'tone', 'content'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-4',
      title: '요약',
      description: '긴 글을 짧고 핵심만 남게 줄여줘요',
      content: '다음 텍스트를 {{length}}으로 요약해주세요. 핵심 포인트를 불릿 포인트로 정리해주세요:\n\n{{text}}',
      tags: ['요약', '생산성'],
      variables: ['length', 'text'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-5',
      title: 'SQL 쿼리 생성',
      description: '데이터베이스에서 원하는 정보를 꺼내는 명령어를 만들어줘요',
      content: '다음 요구사항에 맞는 SQL 쿼리를 작성해주세요:\n\n데이터베이스: {{db_type}}\n테이블: {{tables}}\n요구사항: {{requirement}}',
      tags: ['개발', 'SQL', '데이터'],
      variables: ['db_type', 'tables', 'requirement'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-6',
      title: '블로그 포스트 작성',
      description: '주제를 정하면 읽기 좋은 블로그 글을 써줘요',
      content: '다음 주제로 SEO 최적화된 블로그 포스트를 작성해주세요:\n\n주제: {{topic}}\n타겟 독자: {{audience}}\n키워드: {{keywords}}\n분량: {{length}}\n\n제목, 소제목, 본문, 결론 구조로 작성해주세요.',
      tags: ['콘텐츠', '블로그', '마케팅'],
      variables: ['topic', 'audience', 'keywords', 'length'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-7',
      title: '회의록 작성',
      description: '회의에서 나눈 얘기를 정리해서 깔끔하게 적어줘요',
      content: '다음 회의 내용을 바탕으로 구조화된 회의록을 작성해주세요:\n\n{{meeting_notes}}\n\n다음 형식으로 정리해주세요:\n- 참석자\n- 주요 논의 사항\n- 결정된 사항\n- 담당자별 액션 아이템\n- 다음 회의 일정',
      tags: ['비즈니스', '회의', '생산성'],
      variables: ['meeting_notes'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-8',
      title: '아이디어 브레인스토밍',
      description: '주제를 주면 창의적인 아이디어 10개를 뽑아줘요',
      content: '다음 주제에 대해 창의적인 아이디어 10가지를 제안해주세요:\n\n주제: {{topic}}\n제약 조건: {{constraints}}\n\n각 아이디어에 대해 간단한 설명과 실현 가능성을 평가해주세요.',
      tags: ['창의성', '아이디어', '기획'],
      variables: ['topic', 'constraints'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-9',
      title: '영문 이력서 작성',
      description: '취업용 영어 이력서를 대신 만들어줘요',
      content: '다음 정보를 바탕으로 전문적인 영문 이력서를 작성해주세요:\n\n이름: {{name}}\n직무: {{position}}\n경력: {{experience}}\n기술 스택: {{skills}}\n학력: {{education}}',
      tags: ['취업', '이력서', '영어'],
      variables: ['name', 'position', 'experience', 'skills', 'education'],
      isFavorite: false,
      createdAt: now,
    },
    {
      id: 'default-10',
      title: '오류 메시지 해석',
      description: '에러 메시지가 뭔 뜻인지 알려주고 고치는 방법을 안내해줘요',
      content: '다음 오류 메시지를 분석하고 해결 방법을 알려주세요:\n\n```\n{{error_message}}\n```\n\n1. 오류 원인 설명\n2. 즉각적인 해결 방법\n3. 재발 방지를 위한 권장 사항',
      tags: ['개발', '디버깅', '문제해결'],
      variables: ['error_message'],
      isFavorite: false,
      createdAt: now,
    },
  ];
}

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: getDefaultPrompts(),
  searchQuery: '',
  selectedTag: null,

  addPrompt: (prompt) => {
    const newPrompt: Prompt = {
      ...prompt,
      id: generateId(),
      createdAt: Date.now(),
    };
    set((state) => ({ prompts: [newPrompt, ...state.prompts] }));
    get().saveToStorage();
  },

  updatePrompt: (id, updates) => {
    set((state) => ({
      prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    get().saveToStorage();
  },

  deletePrompt: (id) => {
    set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
    get().saveToStorage();
  },

  toggleFavorite: (id) => {
    set((state) => ({
      prompts: state.prompts.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)),
    }));
    get().saveToStorage();
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),

  getFilteredPrompts: () => {
    const { prompts, searchQuery, selectedTag } = get();
    return prompts.filter((p) => {
      const matchesSearch = !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = !selectedTag || p.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  },

  getAllTags: () => {
    const tags = new Set<string>();
    get().prompts.forEach((p) => p.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:prompts');
      if (stored) set({ prompts: JSON.parse(stored) });
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('blend:prompts', JSON.stringify(get().prompts));
  },
}));
