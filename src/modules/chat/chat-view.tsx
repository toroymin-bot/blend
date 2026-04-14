'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePluginStore } from '@/stores/plugin-store';
import { sendChatRequest } from './chat-api';
import { getModelById, calculateCost, DEFAULT_MODELS } from '@/modules/models/model-registry';
import { ChatMessage } from '@/types';
import { Send, Square, ChevronDown, Copy, Check, RefreshCw, GitFork, Link, Search, Image, Download, FileText, Pencil, X as XIcon, ChevronUp, ChevronDown as ChevronDownIcon, Paperclip, Sparkles, Eye, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { fetchURLContent, isValidURL, extractDomain } from '@/modules/plugins/url-reader';
import { ChartRender, extractChartData } from '@/modules/plugins/chart-render';
import { performWebSearch, extractSearchQuery, formatSearchResultsAsContext } from '@/modules/plugins/web-search';
import { generateImage, extractImagePrompt, extractImageURLs } from '@/modules/plugins/image-gen';
import { downloadChat, downloadChatAsPDF, downloadChatAsJSON } from '@/modules/chat/export-chat';
import { useDocumentStore } from '@/stores/document-store';
import { buildContext } from '@/modules/plugins/document-plugin';
import { routeToModel } from '@/lib/model-router';
import { AUTO_MATCH_AGENT_ID } from '@/stores/agent-store';

// ── Inline text highlight helper ──────────────────────────────────────────────
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-400/80 text-gray-900 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

export function ChatView() {
  const { currentChatId, selectedModel, setSelectedModel, addMessage, getCurrentChat, createChat, removeLastMessage, forkChat, updateChatTitle, editMessage } = useChatStore();
  const { getKey, hasKey } = useAPIKeyStore();
  const { getActiveAgent } = useAgentStore();
  const { addRecord, checkDailyLimit, getTodayCost } = useUsageStore();
  const { systemPrompt, customModels, settings } = useSettingsStore();
  const { isInstalled, loadFromStorage: loadPlugins } = usePluginStore();
  const { getActiveDocs, loadFromDB } = useDocumentStore();
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [fetchingURLs, setFetchingURLs] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // Message editing state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState('');
  // Streaming token counter
  const [streamTokenCount, setStreamTokenCount] = useState(0);
  const [showTokenCounter, setShowTokenCounter] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false); // true while waiting for first chunk
  // In-chat search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Image attachment state
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // 자동 AI 매칭 상태
  const [autoMatchInfo, setAutoMatchInfo] = useState<{ modelName: string; label: string } | null>(null);
  // Chat summary state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const tokenHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadPlugins();
    loadFromDB(); // 데이터소스 문서 IndexedDB에서 로드
  }, []);

  // Close model dropdown when clicking outside
  useEffect(() => {
    if (!showModelDropdown) return;
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelDropdown]);

  const handleCopyMessage = async (msgId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const chat = getCurrentChat();
  const allModels = [...DEFAULT_MODELS, ...customModels];
  const model = getModelById(selectedModel, customModels);
  const enabledModels = allModels.filter((m) => m.enabled);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, streamingText]);

  // In-chat search: compute matching message ids
  const searchMatches = useCallback((): string[] => {
    if (!searchQuery.trim() || !chat) return [];
    const q = searchQuery.toLowerCase();
    return chat.messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [searchQuery, chat]);

  // Keyboard shortcut: Cmd+F / Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch((prev) => {
          if (!prev) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
            return true;
          }
          return prev;
        });
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setSearchMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  // Scroll to current match when index changes
  useEffect(() => {
    const matches = searchMatches();
    if (matches.length === 0) return;
    const idx = ((searchMatchIndex % matches.length) + matches.length) % matches.length;
    const el = messageRefs.current[matches[idx]];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchMatchIndex, searchMatches]);

  const handleSearchNext = () => setSearchMatchIndex((i) => i + 1);
  const handleSearchPrev = () => setSearchMatchIndex((i) => i - 1);

  // ── Image helpers ──────────────────────────────────────────────────────────
  const resizeImage = (dataUrl: string, maxDim = 1024, quality = 0.82): Promise<string> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) {
          const s = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });

  const handleImageFiles = async (files: FileList | File[]) => {
    const items = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 4);
    const results = await Promise.all(
      items.map((f) => new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = (e) => resizeImage(e.target?.result as string).then(res);
        reader.readAsDataURL(f);
      }))
    );
    setAttachedImages((prev) => [...prev, ...results].slice(0, 4));
  };

  // ── Chat summary ───────────────────────────────────────────────────────────
  const handleSummarize = async () => {
    if (!chat || chat.messages.length === 0 || isSummarizing) return;
    const currentModel = getModelById(selectedModel);
    if (!currentModel || !hasKey(currentModel.provider)) return;
    setIsSummarizing(true);
    setSummaryText('');
    setShowSummaryModal(true);
    const convo = chat.messages
      .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content.substring(0, 400)}`)
      .join('\n');
    await sendChatRequest({
      messages: [
        { role: 'system', content: '주어진 대화를 3~5개 불릿 포인트로 한국어로 간결하게 요약하세요. 핵심 주제, 결론, 중요 포인트를 포함하세요.' },
        { role: 'user', content: convo },
      ],
      model: selectedModel,
      provider: currentModel.provider,
      apiKey: getKey(currentModel.provider),
      stream: true,
      onChunk: (t) => setSummaryText((p) => p + t),
      onDone: () => setIsSummarizing(false),
      onError: () => { setSummaryText('요약 생성 중 오류가 발생했습니다.'); setIsSummarizing(false); },
    });
  };

  // ── Cmd+R: regenerate last assistant message ───────────────────────────────
  const handleRegenerateLast = useCallback(async () => {
    if (!currentChatId || isStreaming || !chat) return;
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    const currentModel = getModelById(selectedModel);
    if (!currentModel || !hasKey(currentModel.provider)) return;
    const msgIdx = chat.messages.findIndex((m) => m.id === lastAssistant.id);
    const msgsBeforeRemoved = chat.messages.slice(0, msgIdx);
    removeLastMessage(currentChatId);
    const allMsgs: { role: string; content: string }[] = [];
    const activeAgent = getActiveAgent();
    const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
    if (sysPrompt) allMsgs.push({ role: 'system', content: sysPrompt });
    msgsBeforeRemoved.forEach((m) => allMsgs.push({ role: m.role, content: m.content }));
    await streamAIResponse(currentChatId, allMsgs, currentModel);
  }, [currentChatId, isStreaming, chat, selectedModel, removeLastMessage, getActiveAgent, systemPrompt]);

  // ── Cmd+E: edit last user message ─────────────────────────────────────────
  const handleEditLast = useCallback(() => {
    if (!chat) return;
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setEditingMsgId(lastUser.id);
    setEditingMsgContent(lastUser.content);
  }, [chat]);

  // ── Global keyboard shortcuts (Cmd+R, Cmd+E, /) ───────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isMeta = e.metaKey || e.ctrlKey;
      // Cmd+R — regenerate last
      if (isMeta && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleRegenerateLast();
        return;
      }
      // Cmd+E — edit last user message
      if (isMeta && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleEditLast();
        return;
      }
      // / — focus chat input (when not already typing)
      if (e.key === '/' && !isMeta && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleRegenerateLast, handleEditLast]);

  // Auto-generate chat title using AI after first exchange
  const autoGenerateTitle = async (chatId: string, userMsg: string, assistantMsg: string, provider: string, apiKey: string | null) => {
    try {
      const titleMessages = [
        { role: 'system', content: '다음 대화의 제목을 15자 이내로 한국어로 작성하세요. 제목만 출력하고 다른 내용은 쓰지 마세요.' },
        { role: 'user', content: `사용자: ${userMsg.substring(0, 200)}\nAI: ${assistantMsg.substring(0, 200)}` },
      ];
      let titleText = '';
      await sendChatRequest({
        messages: titleMessages,
        model: selectedModel,
        provider: provider as 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq' | 'custom',
        apiKey: apiKey ?? '',
        stream: true,
        onChunk: (t) => { titleText += t; },
        onDone: (full) => {
          const clean = full.replace(/["'*\n]/g, '').trim().substring(0, 30);
          if (clean) updateChatTitle(chatId, clean);
        },
        onError: () => {},
      });
    } catch {
      // Fail silently — title generation is non-critical
    }
  };

  // Extract URLs from input text
  const extractURLs = (text: string): string[] => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return (text.match(urlRegex) || []).filter(isValidURL);
  };

  // Map raw API error messages to user-friendly Korean messages
  const friendlyError = (error: string): string => {
    if (/api.key|API key|unauthorized|invalid.*key|403/i.test(error)) return '🔑 API 키가 유효하지 않습니다. 설정(⌘,)에서 키를 확인해주세요.';
    if (/quota|rate.limit|429|exceeded|too many requests/i.test(error)) return '⏱ 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    if (/context.length|maximum context|token limit|too long|context_length/i.test(error)) return '📄 대화가 너무 길어 컨텍스트 한도를 초과했습니다. 새 채팅을 시작해주세요.';
    if (/network|failed to fetch|ECONNREFUSED|ERR_NETWORK|net::/i.test(error)) return '🌐 네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    if (/model.*not.*found|invalid.*model|model_not_found/i.test(error)) return '🤖 선택된 모델을 찾을 수 없습니다. 모델 설정을 확인해주세요.';
    if (/overloaded|capacity|service.*unavailable|503/i.test(error)) return '🔄 AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.';
    if (/content.policy|safety|blocked|moderation/i.test(error)) return '🛡 콘텐츠 정책에 의해 요청이 차단되었습니다. 다른 방식으로 질문해주세요.';
    if (/timeout|aborted|cancelled/i.test(error)) return '⏰ 요청 시간이 초과되었습니다. 다시 시도해주세요.';
    if (/insufficient.*funds|billing|payment/i.test(error)) return '💳 API 크레딧이 부족합니다. 해당 서비스의 결제 설정을 확인해주세요.';
    // [2026-04-12 01:07] BUG-016 개선: 알 수 없는 오류도 한국어로 표시
    if (error && error.length > 0) return `⚠️ 오류가 발생했습니다: ${error}`;
    return '⚠️ 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  };

  // Helper: stream AI response given a fully-prepared messages array
  const streamAIResponse = async (
    chatId: string,
    allMessages: import('@/modules/chat/chat-api').ChatRequestMessage[],
    currentModel: ReturnType<typeof getModelById>,
  ) => {
    if (!currentModel) return;
    setIsStreaming(true);
    setIsWaiting(true);
    setStreamingText('');
    setStreamTokenCount(0);
    setShowTokenCounter(true);
    if (tokenHideTimerRef.current) clearTimeout(tokenHideTimerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    await sendChatRequest({
      messages: allMessages,
      model: currentModel.id,
      provider: currentModel.provider,
      apiKey: currentModel.provider === 'custom' ? getKey('custom') : getKey(currentModel.provider),
      baseUrl: currentModel.baseUrl,
      stream: true,
      signal: controller.signal,
      onChunk: (text) => {
        setIsWaiting(false);
        setStreamingText((prev) => {
          const next = prev + text;
          setStreamTokenCount(Math.round(next.length / 4));
          return next;
        });
      },
      onDone: (fullText, usage) => {
        setIsWaiting(false);
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullText,
          model: selectedModel,
          createdAt: Date.now(),
          tokens: usage,
          cost: usage && currentModel ? calculateCost(currentModel, usage.input, usage.output) : undefined,
        };
        addMessage(chatId, assistantMsg);
        if (usage && currentModel) {
          addRecord({
            timestamp: Date.now(),
            model: selectedModel,
            provider: currentModel.provider,
            inputTokens: usage.input,
            outputTokens: usage.output,
            cost: calculateCost(currentModel, usage.input, usage.output),
            chatId,
          });
        }
        setStreamingText('');
        setIsStreaming(false);
        // Hide token counter after 3 s
        tokenHideTimerRef.current = setTimeout(() => {
          setShowTokenCounter(false);
          setStreamTokenCount(0);
        }, 3000);
      },
      onError: (error) => {
        setIsWaiting(false);
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: friendlyError(error),
          createdAt: Date.now(),
          isError: true,
        });
        setStreamingText('');
        setIsStreaming(false);
        setShowTokenCounter(false);
      },
    });
  };

  // Handle saving an inline edit and re-triggering AI
  const handleEditSave = async (msgId: string) => {
    const newContent = editingMsgContent.trim();
    setEditingMsgId(null);
    setEditingMsgContent('');
    if (!newContent || !currentChatId) return;

    const currentModel = getModelById(selectedModel);
    if (!currentModel || !hasKey(currentModel.provider)) return;

    // Update the message and truncate everything after it
    editMessage(currentChatId, msgId, newContent);

    // Re-fetch the updated chat state to build the API messages list
    const updatedChat = useChatStore.getState().getCurrentChat();
    if (!updatedChat) return;

    const allMessages: { role: string; content: string }[] = [];
    const activeAgent = getActiveAgent();
    const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
    if (sysPrompt) allMessages.push({ role: 'system', content: sysPrompt });
    updatedChat.messages.forEach((m) => allMessages.push({ role: m.role, content: m.content }));

    await streamAIResponse(currentChatId, allMessages, currentModel);
  };

  const handleSend = async () => {
    if ((!input.trim() && attachedImages.length === 0) || isStreaming) return;

    let chatId = currentChatId;
    if (!chatId) {
      chatId = createChat();
    }

    // [2026-04-13 00:00] BUG-004: 삭제된 모델 선택 시 null 체크 + 사용 가능한 첫 번째 모델로 자동 폴백
    // 기존: if (!currentModel) return;  — 아무 안내 없이 조용히 실패
    let currentModel = getModelById(selectedModel, customModels);
    if (!currentModel) {
      const fallback = [...DEFAULT_MODELS, ...customModels].find((m) => m.enabled);
      if (!fallback) {
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '⚠️ 선택된 모델을 찾을 수 없고, 사용 가능한 모델도 없습니다. 설정에서 모델을 활성화해 주세요.',
          createdAt: Date.now(),
        });
        return;
      }
      setSelectedModel(fallback.id);
      currentModel = fallback;
      addMessage(chatId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ 선택된 모델을 찾을 수 없어 **${fallback.name}**으로 자동 전환되었습니다.`,
        createdAt: Date.now(),
      });
    }

    // ── 자동 AI 매칭: 질문 내용 분석 → 최적 모델로 currentModel 오버라이드 ──
    // setSelectedModel은 비동기라 위에서 쓸 수 없으므로 currentModel을 직접 교체
    const routingAgent = getActiveAgent();
    if (routingAgent?.id === AUTO_MATCH_AGENT_ID) {
      const allEnabled = [...DEFAULT_MODELS, ...customModels].filter((m) => m.enabled);
      const route = routeToModel(input.trim(), attachedImages.length > 0, allEnabled, hasKey);
      const routedModel = getModelById(route.modelId, customModels);
      if (routedModel && hasKey(routedModel.provider)) {
        currentModel = routedModel;
        setAutoMatchInfo({ modelName: routedModel.name, label: route.label });
      }
    } else {
      setAutoMatchInfo(null);
    }

    // [2026-04-13 00:00] BUG-012: 일일 API 비용 한도 초과 시 전송 차단
    if (checkDailyLimit(settings.dailyCostLimit)) {
      addMessage(chatId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `🚫 오늘의 API 비용 한도($${settings.dailyCostLimit.toFixed(2)})를 초과했습니다. 현재 오늘 사용액: $${getTodayCost().toFixed(4)}.\n\n한도를 조정하려면 **설정(⌘,) → 일일 비용 한도**에서 변경하세요.`,
        createdAt: Date.now(),
      });
      return;
    }

    if (!hasKey(currentModel.provider)) {
      addMessage(chatId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${currentModel.provider} API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.`,
        createdAt: Date.now(),
      });
      return;
    }

    let userContent = input.trim();
    const capturedImages = [...attachedImages];
    setInput('');
    setAttachedImages([]);

    // DALL-E 모델 선택 시 — 모든 메시지를 이미지 생성 프롬프트로 처리
    const isDalleModel = ['dall-e-3', 'dall-e-2', 'gpt-image-1'].includes(selectedModel);
    if (isDalleModel) {
      const openaiKey = getKey('openai');
      if (!openaiKey) {
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '🔑 OpenAI API 키가 필요해요. 설정 탭에서 API 키를 입력해주세요.',
          createdAt: Date.now(),
        });
        return;
      }
      setIsGeneratingImage(true);
      const result = await generateImage(userContent, openaiKey);
      setIsGeneratingImage(false);
      if (result.error) {
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `🎨 이미지 생성 실패: ${result.error}`,
          createdAt: Date.now(),
        });
      } else {
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `![generated](${result.url})\n\n*"${userContent.slice(0, 80)}${userContent.length > 80 ? '...' : ''}"*`,
          createdAt: Date.now(),
        });
      }
      return;
    }

    // Image Generation plugin: handle /image command
    const imageGenEnabled = isInstalled('image-gen');
    if (imageGenEnabled) {
      const imagePrompt = extractImagePrompt(userContent);
      if (imagePrompt) {
        const openaiKey = getKey('openai');
        if (!openaiKey) {
          addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'OpenAI API 키가 설정되지 않았습니다. 설정에서 OpenAI 키를 입력해주세요.',
            createdAt: Date.now(),
          });
          return;
        }

        // Add user message immediately
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'user',
          content: userContent,
          createdAt: Date.now(),
        });

        setIsGeneratingImage(true);
        const result = await generateImage(imagePrompt, openaiKey);
        setIsGeneratingImage(false);

        if (result.error) {
          addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `이미지 생성 실패: ${result.error}`,
            createdAt: Date.now(),
          });
        } else if (result.url) {
          addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `이미지가 생성되었습니다:\n\n![생성된 이미지](${result.url})`,
            createdAt: Date.now(),
          });
        }
        return;
      }
    }

    // Web Search plugin: handle !search or ?query patterns
    const webSearchEnabled = isInstalled('web-search');
    if (webSearchEnabled) {
      const searchQuery = extractSearchQuery(userContent);
      if (searchQuery) {
        setIsSearching(true);
        const searchResult = await performWebSearch(searchQuery);
        setIsSearching(false);

        if (searchResult.available && searchResult.results) {
          const context = formatSearchResultsAsContext(searchQuery, searchResult.results);
          // Append search results to user content as context
          userContent = `${userContent}\n\n${context}`;
        } else if (!searchResult.available) {
          // Server doesn't have API key — inform the user
          addMessage(chatId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '웹 검색 플러그인이 설치되었지만 서버에 BRAVE_SEARCH_API_KEY가 설정되지 않았습니다.',
            createdAt: Date.now(),
          });
          return;
        }
      }
    }

    // URL Reader plugin: fetch URL content if enabled
    const urlReaderEnabled = isInstalled('url-reader');
    if (urlReaderEnabled) {
      const urls = extractURLs(userContent);
      if (urls.length > 0) {
        setFetchingURLs(urls);
        const urlResults = await Promise.all(urls.map(fetchURLContent));
        setFetchingURLs([]);

        const urlContext = urlResults
          .filter((r) => !r.error && r.text)
          .map((r) => `[URL: ${r.url}]\n제목: ${r.title}\n${r.description ? `설명: ${r.description}\n` : ''}내용:\n${r.text}`)
          .join('\n\n---\n\n');

        if (urlContext) {
          userContent = `${userContent}\n\n--- URL 컨텍스트 ---\n${urlContext}`;
        }
      }
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(), // Display original input (without URL context)
      images: capturedImages.length > 0 ? capturedImages : undefined,
      createdAt: Date.now(),
    };
    addMessage(chatId, userMsg);

    const activeAgent = getActiveAgent();
    const allMessages: import('@/modules/chat/chat-api').ChatRequestMessage[] = [];
    const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
    // NOTE: loadFromDB()가 useEffect에서 호출된 후에야 activeDocs에 문서가 담긴다.
    // chat-view 마운트 시 반드시 loadFromDB()를 호출해야 함. (재발 방지)
    const activeDocs = getActiveDocs();
    const embeddingApiKey = getKey('openai') || getKey('google') || undefined;
    const embeddingProvider: 'openai' | 'google' | undefined = getKey('openai') ? 'openai' : getKey('google') ? 'google' : undefined;
    const docContext = activeDocs.length > 0
      ? await buildContext(userContent, activeDocs, embeddingApiKey, embeddingProvider)
      : '';
    const fullSysPrompt = [sysPrompt, docContext].filter(Boolean).join('\n\n');
    if (fullSysPrompt) {
      allMessages.push({ role: 'system', content: fullSysPrompt });
    }
    // Build messages for API: prior messages (text only) + new user message (with images if any)
    const priorMsgs = (chat?.messages || []).map((m) => ({ role: m.role, content: m.content }));
    // Last message = current user message with potential images
    const lastMsgContent: import('@/modules/chat/chat-api').MessageContent =
      capturedImages.length > 0
        ? [
            { type: 'text' as const, text: userContent },
            ...capturedImages.map((url) => ({ type: 'image_url' as const, url })),
          ]
        : userContent;
    allMessages.push(...priorMsgs, { role: 'user', content: lastMsgContent });

    const isFirstMessage = !chat || chat.messages.length === 0;
    const capturedInput = userContent;

    // Use shared stream helper — wrap to handle auto-title
    setIsStreaming(true);
    setIsWaiting(true);
    setStreamingText('');
    setStreamTokenCount(0);
    setShowTokenCounter(true);
    if (tokenHideTimerRef.current) clearTimeout(tokenHideTimerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    await sendChatRequest({
      messages: allMessages,
      model: currentModel.id,
      provider: currentModel.provider,
      apiKey: currentModel.provider === 'custom' ? getKey('custom') : getKey(currentModel.provider),
      baseUrl: currentModel.baseUrl,
      stream: true,
      signal: controller.signal,
      onChunk: (text) => {
        setIsWaiting(false);
        setStreamingText((prev) => {
          const next = prev + text;
          setStreamTokenCount(Math.round(next.length / 4));
          return next;
        });
      },
      onDone: (fullText, usage) => {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullText,
          model: currentModel.id,
          createdAt: Date.now(),
          tokens: usage,
          cost: usage && currentModel ? calculateCost(currentModel, usage.input, usage.output) : undefined,
        };
        addMessage(chatId!, assistantMsg);
        if (usage && currentModel) {
          addRecord({
            timestamp: Date.now(),
            model: selectedModel,
            provider: currentModel.provider,
            inputTokens: usage.input,
            outputTokens: usage.output,
            cost: calculateCost(currentModel, usage.input, usage.output),
            chatId: chatId!,
          });
        }

        // Auto-generate title after first AI response
        if (isFirstMessage) {
          autoGenerateTitle(chatId!, capturedInput, fullText, currentModel.provider, getKey(currentModel.provider));
        }

        setStreamingText('');
        setIsStreaming(false);
        tokenHideTimerRef.current = setTimeout(() => {
          setShowTokenCounter(false);
          setStreamTokenCount(0);
        }, 3000);
      },
      onError: (error) => {
        setIsWaiting(false);
        addMessage(chatId!, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: friendlyError(error),
          createdAt: Date.now(),
          isError: true,
        });
        setStreamingText('');
        setIsStreaming(false);
        setShowTokenCounter(false);
      },
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    if (streamingText && currentChatId) {
      addMessage(currentChatId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamingText,
        model: selectedModel,
        createdAt: Date.now(),
      });
      setStreamingText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // [2026-04-13] BUG-013: 한국어 IME 조합 중 Enter 시 마지막 글자가 별도 메시지로 전송되는 버그
    // isComposing=true 이면 IME가 아직 글자를 조합 중 → 전송하지 않고 IME가 글자 확정하도록 대기
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const chartRenderEnabled = isInstalled('chart-render');
  // Show images when image-gen plugin is installed OR when message content has embedded data: images
  // (the latter comes from Gemini image-generation models)
  const imageGenEnabledForRender = isInstalled('image-gen');

  return (
    <div
      className="flex flex-col h-full bg-surface"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files); }}
    >
      {/* Summary Modal */}
      {showSummaryModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSummaryModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="대화 요약"
        >
          <div
            className="bg-surface-2 border border-border-token rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Sparkles size={16} className="text-blue-400" /> 대화 요약
              </h2>
              <button onClick={() => setShowSummaryModal(false)} className="text-on-surface-muted hover:text-on-surface p-1" aria-label="닫기">
                <XIcon size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isSummarizing && !summaryText && (
                <div className="flex items-center gap-2 text-on-surface-muted text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  요약 생성 중...
                </div>
              )}
              {summaryText && (
                <div className="prose prose-invert prose-sm max-w-none text-on-surface">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image input (hidden) */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Header with active agent — 자동 AI 매칭은 하단 버튼에 표시되므로 헤더 숨김 */}
      {getActiveAgent() && getActiveAgent()?.id !== AUTO_MATCH_AGENT_ID && (
        <div className="px-4 py-2 border-b border-border-token flex items-center gap-2 bg-surface-2">
          <span className="text-lg">{getActiveAgent()?.icon}</span>
          <span className="text-sm text-on-surface">{getActiveAgent()?.name}</span>
          <span className="text-xs text-on-surface-muted">· {getActiveAgent()?.model}</span>
        </div>
      )}

      {/* In-chat search panel */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-border-token bg-surface-2 flex items-center gap-2">
          <Search size={14} className="text-on-surface-muted shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.shiftKey ? handleSearchPrev() : handleSearchNext(); }
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchMatchIndex(0); }
            }}
            placeholder="채팅 내 검색... (Enter: 다음, Shift+Enter: 이전)"
            className="flex-1 bg-transparent text-on-surface placeholder-on-surface-muted outline-none text-sm"
          />
          {searchQuery && (() => {
            const matches = searchMatches();
            const idx = matches.length > 0 ? ((searchMatchIndex % matches.length) + matches.length) % matches.length : 0;
            return (
              <span className="text-xs text-on-surface-muted shrink-0">
                {matches.length > 0 ? `${idx + 1} / ${matches.length}` : '결과 없음'}
              </span>
            );
          })()}
          <button onClick={handleSearchPrev} className="p-1 text-on-surface-muted hover:text-on-surface" title="이전 (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={handleSearchNext} className="p-1 text-on-surface-muted hover:text-on-surface" title="다음 (Enter)">
            <ChevronDownIcon size={14} />
          </button>
          <button
            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchMatchIndex(0); }}
            className="p-1 text-on-surface-muted hover:text-on-surface"
            title="닫기 (ESC)"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto chat-messages"
        onTouchMove={() => {
          if (showSearch) { setShowSearch(false); setSearchQuery(''); setSearchMatchIndex(0); }
        }}
      >
        {!chat || chat.messages.length === 0 ? (
          // [2026-04-12 01:07] UX 개선: 빈 상태에 시작 가이드 + 클릭 가능한 예시 질문 추가
          <div className="flex items-center justify-center h-full px-6 py-8 overflow-y-auto">
            <div className="text-center w-full max-w-lg">
              {/* Logo mark */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white mx-auto mb-5 shadow-lg shadow-blue-500/20">
                B
              </div>
              {/* Motto */}
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug mb-2">
                무엇을 도와드릴까요?
              </h1>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                아래 예시를 클릭하거나 직접 입력하세요
              </p>
              {/* Active agent badge — 자동 AI 매칭은 하단 버튼에 표시되므로 배너 숨김 */}
              {getActiveAgent() && getActiveAgent()?.id !== AUTO_MATCH_AGENT_ID && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-5 bg-blue-900/30 text-blue-300">
                  <span className="text-lg">{getActiveAgent()?.icon}</span>
                  <span>에이전트: {getActiveAgent()?.name}</span>
                </div>
              )}
              {/* Quick-start suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6 text-left">
                {[
                  { icon: '✍️', text: '이메일 초안을 작성해줘 — 회의 일정 조율', label: '글쓰기 도움' },
                  { icon: '🔍', text: '?파이썬으로 CSV 파일 읽는 방법', label: '웹 검색' },
                  { icon: '🎨', text: '/image 한국의 아름다운 가을 산 풍경', label: '이미지 생성' },
                  { icon: '💻', text: 'JavaScript로 할 일 목록 앱 만드는 방법', label: '코딩 도움' },
                ].map((s) => (
                  <button
                    key={s.text}
                    onClick={() => {
                      const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="메시지를 입력하세요..."]');
                      if (input) {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                        nativeInputValueSetter?.call(input, s.text);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.focus();
                      }
                    }}
                    className="flex items-start gap-2.5 p-3 bg-gray-800/60 hover:bg-gray-700/80 border border-gray-700/50 hover:border-gray-600 rounded-xl text-left transition-colors min-h-[44px]"
                    title={s.label}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{s.icon}</span>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
                      <p className="text-sm text-gray-300 leading-snug">{s.text}</p>
                    </div>
                  </button>
                ))}
              </div>
              {/* 구독/업그레이드 유도 메시지 */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                <span>💳</span>
                <span>API 키 없이 시작하고 싶으신가요?</span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('blend:open-settings'))}
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                  title="설정에서 API 키를 등록하거나 무료 Google API를 사용해보세요"
                >
                  Google AI 무료로 시작하기 →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4 px-4">
            {(() => {
              const matches = searchMatches();
              const matchIdx = matches.length > 0 ? ((searchMatchIndex % matches.length) + matches.length) % matches.length : 0;
              return chat.messages.map((msg) => {
              const isSearchMatch = searchQuery.trim() !== '' && matches.includes(msg.id);
              const isCurrentMatch = isSearchMatch && matches[matchIdx] === msg.id;
              return (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el; }}
                className={`mb-4 group ${msg.role === 'user' ? 'flex justify-end' : ''}`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] transition-colors ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : msg.isError
                      ? 'bg-red-900/30 text-red-300 border border-red-800/50'
                      : 'bg-gray-800 text-gray-200'
                  } ${isCurrentMatch ? 'ring-2 ring-yellow-400' : isSearchMatch ? 'ring-1 ring-yellow-600/50' : ''}`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const rawInfo = (className || '').replace(/^language-/, '');
                            const colonIdx = rawInfo.indexOf(':');
                            const spaceIdx = rawInfo.indexOf(' ');
                            let lang: string | undefined;
                            let filename: string | undefined;
                            if (colonIdx > 0) {
                              lang = rawInfo.slice(0, colonIdx);
                              filename = rawInfo.slice(colonIdx + 1) || undefined;
                            } else if (spaceIdx > 0) {
                              lang = rawInfo.slice(0, spaceIdx);
                              filename = rawInfo.slice(spaceIdx + 1).trim() || undefined;
                            } else {
                              lang = rawInfo || undefined;
                            }
                            const isBlock = String(children).includes('\n');
                            if (isBlock || lang) {
                              return <CodeBlock language={lang} filename={filename}>{String(children).replace(/\n$/, '')}</CodeBlock>;
                            }
                            return <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm text-pink-300" {...props}>{children}</code>;
                          },
                        }}
                      >{msg.content}</ReactMarkdown>

                      {/* Chart rendering if chart-render plugin enabled */}
                      {chartRenderEnabled && (() => {
                        const chartData = extractChartData(msg.content);
                        return chartData ? <ChartRender data={chartData} /> : null;
                      })()}

                      {/* Image rendering: show images from URLs detected in AI response */}
                      {(imageGenEnabledForRender || msg.content.includes('data:image/')) && (() => {
                        const imgUrls = extractImageURLs(msg.content);
                        if (imgUrls.length === 0) return null;
                        return (
                          <div className="mt-3 flex flex-col gap-2">
                            {imgUrls.map((url) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={url}
                                src={url}
                                alt="AI 생성 이미지"
                                className="rounded-xl max-w-full border border-gray-700"
                                style={{ maxHeight: '400px', objectFit: 'contain' }}
                              />
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ) : editingMsgId === msg.id ? (
                    /* Inline edit textarea */
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editingMsgContent}
                        onChange={(e) => setEditingMsgContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleEditSave(msg.id); }
                          if (e.key === 'Escape') { setEditingMsgId(null); setEditingMsgContent(''); }
                        }}
                        autoFocus
                        rows={3}
                        className="w-full bg-blue-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setEditingMsgId(null); setEditingMsgContent(''); }}
                          className="px-3 py-1 text-xs bg-blue-700/60 hover:bg-blue-700 rounded-lg"
                        >취소</button>
                        <button
                          onClick={() => handleEditSave(msg.id)}
                          className="px-3 py-1 text-xs bg-white text-blue-700 hover:bg-blue-50 rounded-lg font-medium"
                        >저장 후 재생성</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Attached images (user message) */}
                      {(msg.images ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(msg.images ?? []).map((img, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={img} alt={`첨부 이미지 ${i + 1}`} className="max-h-48 rounded-lg object-contain border border-white/10" />
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">
                        {searchQuery.trim() ? highlightText(msg.content, searchQuery) : msg.content}
                      </p>
                    </>
                  )}
                  {/* Action buttons */}
                  <div className={`flex items-center gap-1 mt-2 ${msg.role === 'assistant' ? 'border-t border-gray-700 pt-1.5' : ''}`}>
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="text-gray-500 hover:text-gray-300 p-1 rounded transition-colors"
                      title="복사"
                    >
                      {copiedMsgId === msg.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    </button>
                    <button
                      onClick={() => {
                        const idx = chat.messages.findIndex((m) => m.id === msg.id);
                        if (idx >= 0) forkChat(currentChatId!, idx);
                      }}
                      className="text-gray-500 hover:text-green-400 p-1 rounded transition-colors"
                      title="여기서 분기"
                    >
                      <GitFork size={13} />
                    </button>
                    {msg.role === 'user' && !isStreaming && (
                      <button
                        onClick={() => { setEditingMsgId(msg.id); setEditingMsgContent(msg.content); }}
                        className="text-gray-400 hover:text-yellow-300 p-1 rounded transition-colors"
                        title="편집"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {msg.isError && !isStreaming && (
                      <button
                        onClick={handleRegenerateLast}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 transition-colors ml-1"
                        title="다시 시도"
                      >
                        <RefreshCw size={11} />다시 시도
                      </button>
                    )}
                    {msg.role === 'assistant' && !msg.isError && msg.id === chat.messages[chat.messages.length - 1]?.id && !isStreaming && (
                      <button
                        onClick={async () => {
                          removeLastMessage(currentChatId!);
                          const lastUserMsg = chat.messages.filter((m) => m.role === 'user').pop();
                          if (!lastUserMsg || !currentChatId) return;
                          const currentModel = getModelById(selectedModel);
                          if (!currentModel || !hasKey(currentModel.provider)) return;
                          // Build messages up to (but not including) the removed assistant message
                          const msgsBeforeRemoved = chat.messages.slice(0, chat.messages.findIndex((m) => m.id === msg.id));
                          const allMsgs: { role: string; content: string }[] = [];
                          const activeAgent = getActiveAgent();
                          const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
                          if (sysPrompt) allMsgs.push({ role: 'system', content: sysPrompt });
                          msgsBeforeRemoved.forEach((m) => allMsgs.push({ role: m.role, content: m.content }));
                          await streamAIResponse(currentChatId, allMsgs, currentModel);
                        }}
                        className="text-gray-500 hover:text-blue-400 p-1 rounded transition-colors"
                        title="재생성"
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                    {msg.cost !== undefined && (
                      <span className="text-xs text-gray-600 ml-1">
                        {msg.model} · ${msg.cost.toFixed(4)} · {msg.tokens?.input}+{msg.tokens?.output}t
                      </span>
                    )}
                    {msg.createdAt && (
                      <span
                        className="text-xs text-gray-700 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={new Date(msg.createdAt).toLocaleString('ko-KR')}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            });
            })()}
            {isStreaming && isWaiting && !streamingText && (
              <div className="mb-4">
                <div className="rounded-2xl px-4 py-4 bg-gray-800 max-w-[85%]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-xs text-gray-500 ml-1">응답 대기 중...</span>
                  </div>
                </div>
              </div>
            )}
            {isStreaming && streamingText && (
              <div className="mb-4">
                <div className="rounded-2xl px-4 py-3 bg-gray-800 text-gray-200 max-w-[85%]">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-500">응답 중...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Streaming token counter — fixed bottom-right */}
      {showTokenCounter && (
        <div className="fixed bottom-24 right-4 z-40 pointer-events-none">
          <div className="px-3 py-1.5 bg-gray-800/90 border border-gray-700 rounded-full text-xs text-gray-400 flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'}`} />
            ~{streamTokenCount} 토큰 · ${(streamTokenCount * 0.000003).toFixed(6)}
          </div>
        </div>
      )}

      {/* URL fetching indicator */}
      {fetchingURLs.length > 0 && (
        <div className="px-4 py-2 bg-blue-900/20 border-t border-blue-800/30 flex items-center gap-2">
          <Link size={13} className="text-blue-400 animate-pulse" />
          <span className="text-xs text-blue-300">
            URL 읽는 중: {fetchingURLs.map(extractDomain).join(', ')}...
          </span>
        </div>
      )}

      {/* Web search indicator */}
      {isSearching && (
        <div className="px-4 py-2 bg-green-900/20 border-t border-green-800/30 flex items-center gap-2">
          <Search size={13} className="text-green-400 animate-pulse" />
          <span className="text-xs text-green-300">웹 검색 중...</span>
        </div>
      )}

      {/* Image generation indicator */}
      {isGeneratingImage && (
        <div className="px-4 py-3 bg-purple-900/20 border-t border-purple-800/30 flex items-center gap-3">
          <div className="relative">
            <Image size={16} className="text-purple-400" />
            <span className="absolute inset-0 animate-ping rounded-full bg-purple-400/30" />
          </div>
          <div>
            <p className="text-sm text-purple-300 font-medium">이미지 생성 중...</p>
            <p className="text-xs text-purple-500">DALL-E 3 처리 중 (최대 30초)</p>
          </div>
          <div className="ml-auto flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1 h-6 bg-purple-500 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 100}ms`, opacity: 0.4 + i * 0.12 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border-token p-4 pb-4 mobile-input-area" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="max-w-3xl mx-auto">
          {/* Model selector */}
          <div ref={modelDropdownRef} className="flex items-center gap-2 mb-2 relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-left"
            >
              <div className="min-w-0">
                {getActiveAgent()?.id === AUTO_MATCH_AGENT_ID ? (
                  <>
                    <div className="text-sm font-medium text-violet-300 leading-tight flex items-center gap-1">
                      🤖 자동 AI 매칭
                    </div>
                    {autoMatchInfo ? (
                      <div className="text-xs text-gray-400 leading-tight truncate max-w-[220px]">
                        {autoMatchInfo.label} → {autoMatchInfo.modelName}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 leading-tight">질문에 맞는 AI를 자동 선택</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-gray-200 leading-tight">{model?.name || selectedModel}</div>
                    {model?.description && (
                      <div className="text-xs text-gray-500 leading-tight truncate max-w-[220px]">{model.description}</div>
                    )}
                  </>
                )}
              </div>
              <ChevronDown size={14} className="shrink-0 text-gray-400" />
            </button>
            {/* Active plugin indicators */}
            {isInstalled('url-reader') && (
              <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Link size={11} /> URL 읽기
              </span>
            )}
            {isInstalled('web-search') && (
              <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Search size={11} /> 웹 검색
              </span>
            )}
            {isInstalled('image-gen') && (
              <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Image size={11} /> 이미지
              </span>
            )}

            {/* Summary button */}
            {chat && chat.messages.length > 1 && (
              <button
                onClick={handleSummarize}
                disabled={isSummarizing}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-xs text-gray-400 hover:text-yellow-300 hover:bg-gray-700 disabled:opacity-50"
                title="대화 요약 (AI)"
                aria-label="AI로 대화 요약 생성"
              >
                <Sparkles size={13} /> 요약
              </button>
            )}

            {/* Export button */}
            {chat && chat.messages.length > 0 && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                  title="내보내기"
                  aria-label="채팅 내보내기"
                >
                  <Download size={13} />
                  내보내기
                </button>
                {showExportMenu && (
                  <div className="absolute bottom-8 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-40">
                    <button
                      onClick={() => { downloadChat(chat, 'md'); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2 rounded-t-lg"
                    >
                      <FileText size={12} /> Markdown (.md)
                    </button>
                    <button
                      onClick={() => { downloadChat(chat, 'txt'); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    >
                      <FileText size={12} /> 텍스트 (.txt)
                    </button>
                    <button
                      onClick={() => { downloadChatAsJSON(chat); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                    >
                      <FileText size={12} /> JSON (.json)
                    </button>
                    <button
                      onClick={() => { downloadChatAsPDF(chat); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2 rounded-b-lg"
                    >
                      <FileText size={12} /> PDF (인쇄)
                    </button>
                  </div>
                )}
              </div>
            )}

            {showModelDropdown && (
              <div className="absolute bottom-8 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-80 max-h-96 overflow-y-auto">
                {(['openai', 'anthropic', 'google', 'deepseek', 'groq', 'custom'] as const).map((provider) => {
                  const providerModels = enabledModels.filter((m) => m.provider === provider);
                  if (providerModels.length === 0) return null;
                  const providerLabel: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek', groq: 'Groq', custom: 'Custom' };
                  const providerColor: Record<string, string> = { openai: 'text-green-400', anthropic: 'text-orange-400', google: 'text-blue-400', deepseek: 'text-indigo-400', groq: 'text-red-400', custom: 'text-gray-400' };
                  return (
                    <div key={provider}>
                      <div className={`px-3 py-1.5 text-xs font-semibold ${providerColor[provider]} bg-gray-900/50 border-b border-gray-700 uppercase tracking-wider`}>
                        {providerLabel[provider]}
                      </div>
                      {providerModels.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedModel(m.id); setShowModelDropdown(false); }}
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors flex items-start gap-2 ${
                            m.id === selectedModel ? 'bg-gray-700/80' : ''
                          }`}
                        >
                          <Check size={14} className={`mt-0.5 shrink-0 ${m.id === selectedModel ? 'text-blue-400' : 'opacity-0'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-sm font-medium ${m.id === selectedModel ? 'text-blue-400' : 'text-gray-200'}`}>{m.name}</span>
                              {m.features.includes('vision') && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-800/50">
                                  <Eye size={9} />V
                                </span>
                              )}
                              {m.features.includes('thinking') && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0 rounded bg-violet-900/60 text-violet-400 border border-violet-800/50">
                                  <Brain size={9} />T
                                </span>
                              )}
                            </div>
                            {m.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active document indicator */}
          {getActiveDocs().length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 text-xs text-blue-400">
              <FileText size={12} />
              <span>{getActiveDocs().map((d) => d.name).join(', ')} 참조 중</span>
            </div>
          )}

          {/* Attached image previews */}
          {attachedImages.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={`첨부 이미지 ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-700" />
                  <button
                    onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 border border-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 touch-visible transition-opacity"
                    aria-label={`이미지 ${i + 1} 제거`}
                  ><XIcon size={10} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <div className="flex items-end gap-2 bg-gray-800 rounded-xl p-2">
            {/* Image attach button */}
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-gray-300 shrink-0 self-end mb-0.5"
              title="이미지 첨부 (Vision 모델 필요)"
              aria-label="이미지 파일 첨부"
            >
              <Paperclip size={18} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요..."
              rows={1}
              className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 outline-none resize-none max-h-40 px-2 py-1"
              style={{ minHeight: '36px' }}
            />
            {isStreaming ? (
              <button onClick={handleStop} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white touch-target flex items-center gap-1.5 font-medium text-sm shadow-lg shadow-red-900/40">
                <Square size={16} fill="currentColor" />
                <span className="hidden sm:inline">중지</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && attachedImages.length === 0}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed touch-target flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
