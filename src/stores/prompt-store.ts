// Blend - Prompt Store (Reusable: any project needing prompt templates)

import { create } from 'zustand';
import { Prompt } from '@/types';

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

const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'default-1',
    title: '한국어 번역',
    content: '다음 텍스트를 자연스러운 한국어로 번역해주세요:\n\n{{text}}',
    tags: ['번역', '한국어'],
    variables: ['text'],
    isFavorite: true,
    createdAt: Date.now(),
  },
  {
    id: 'default-2',
    title: '코드 리뷰',
    content: '다음 코드를 리뷰해주세요. 버그, 성능 이슈, 보안 취약점을 확인하고 개선안을 제시해주세요:\n\n```{{language}}\n{{code}}\n```',
    tags: ['개발', '코드리뷰'],
    variables: ['language', 'code'],
    isFavorite: true,
    createdAt: Date.now(),
  },
  {
    id: 'default-3',
    title: '이메일 작성',
    content: '다음 상황에 맞는 비즈니스 이메일을 작성해주세요:\n\n수신자: {{recipient}}\n목적: {{purpose}}\n톤: {{tone}}\n\n핵심 내용:\n{{content}}',
    tags: ['비즈니스', '이메일'],
    variables: ['recipient', 'purpose', 'tone', 'content'],
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'default-4',
    title: '요약',
    content: '다음 텍스트를 {{length}}으로 요약해주세요. 핵심 포인트를 불릿 포인트로 정리해주세요:\n\n{{text}}',
    tags: ['요약', '생산성'],
    variables: ['length', 'text'],
    isFavorite: false,
    createdAt: Date.now(),
  },
  {
    id: 'default-5',
    title: 'SQL 쿼리 생성',
    content: '다음 요구사항에 맞는 SQL 쿼리를 작성해주세요:\n\n데이터베이스: {{db_type}}\n테이블: {{tables}}\n요구사항: {{requirement}}',
    tags: ['개발', 'SQL', '데이터'],
    variables: ['db_type', 'tables', 'requirement'],
    isFavorite: false,
    createdAt: Date.now(),
  },
];

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: DEFAULT_PROMPTS,
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
