'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePluginStore } from '@/stores/plugin-store';
import { sendChatRequest } from './chat-api';
import { getModelById, calculateCost, DEFAULT_MODELS } from '@/modules/models/model-registry';
import { ChatMessage } from '@/types';
import { Send, Square, ChevronDown, Copy, Check, RefreshCw, GitFork, Link, Search, Image, Download, FileText, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { fetchURLContent, isValidURL, extractDomain } from '@/modules/plugins/url-reader';
import { ChartRender, extractChartData } from '@/modules/plugins/chart-render';
import { performWebSearch, extractSearchQuery, formatSearchResultsAsContext } from '@/modules/plugins/web-search';
import { generateImage, extractImagePrompt, extractImageURLs } from '@/modules/plugins/image-gen';
import { downloadChat, downloadChatAsPDF, downloadChatAsJSON } from '@/modules/chat/export-chat';

export function ChatView() {
  const { currentChatId, selectedModel, setSelectedModel, addMessage, getCurrentChat, createChat, removeLastMessage, forkChat, updateChatTitle, editMessage } = useChatStore();
  const { getKey, hasKey } = useAPIKeyStore();
  const { getActiveAgent } = useAgentStore();
  const { addRecord } = useUsageStore();
  const { systemPrompt } = useSettingsStore();
  const { isInstalled, loadFromStorage: loadPlugins } = usePluginStore();
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
  const tokenHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const handleCopyMessage = async (msgId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const chat = getCurrentChat();
  const model = getModelById(selectedModel);
  const enabledModels = DEFAULT_MODELS.filter((m) => m.enabled);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, streamingText]);

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
        provider: provider as 'openai' | 'anthropic' | 'google' | 'custom',
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

  // Helper: stream AI response given a fully-prepared messages array
  const streamAIResponse = async (
    chatId: string,
    allMessages: { role: string; content: string }[],
    currentModel: ReturnType<typeof getModelById>,
  ) => {
    if (!currentModel) return;
    setIsStreaming(true);
    setStreamingText('');
    setStreamTokenCount(0);
    setShowTokenCounter(true);
    if (tokenHideTimerRef.current) clearTimeout(tokenHideTimerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    await sendChatRequest({
      messages: allMessages,
      model: selectedModel,
      provider: currentModel.provider,
      apiKey: getKey(currentModel.provider),
      stream: true,
      signal: controller.signal,
      onChunk: (text) => {
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
        addMessage(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `오류: ${error}`,
          createdAt: Date.now(),
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
    if (!input.trim() || isStreaming) return;

    let chatId = currentChatId;
    if (!chatId) {
      chatId = createChat();
    }

    const currentModel = getModelById(selectedModel);
    if (!currentModel) return;

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
    setInput('');

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
      createdAt: Date.now(),
    };
    addMessage(chatId, userMsg);

    const activeAgent = getActiveAgent();
    const allMessages: { role: string; content: string }[] = [];
    const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
    if (sysPrompt) {
      allMessages.push({ role: 'system', content: sysPrompt });
    }
    // Use enriched content (with URL data) for API, but display original
    const messagesForAPI = [...(chat?.messages || []), { ...userMsg, content: userContent }].map((m) => ({
      role: m.role,
      content: m.content,
    }));
    allMessages.push(...messagesForAPI);

    const isFirstMessage = !chat || chat.messages.length === 0;
    const capturedInput = input.trim();

    // Use shared stream helper — wrap to handle auto-title
    setIsStreaming(true);
    setStreamingText('');
    setStreamTokenCount(0);
    setShowTokenCounter(true);
    if (tokenHideTimerRef.current) clearTimeout(tokenHideTimerRef.current);

    const controller = new AbortController();
    abortRef.current = controller;

    await sendChatRequest({
      messages: allMessages,
      model: selectedModel,
      provider: currentModel.provider,
      apiKey: getKey(currentModel.provider),
      stream: true,
      signal: controller.signal,
      onChunk: (text) => {
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
          model: selectedModel,
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
        addMessage(chatId!, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `오류: ${error}`,
          createdAt: Date.now(),
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const chartRenderEnabled = isInstalled('chart-render');
  const imageGenEnabledForRender = isInstalled('image-gen');

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header with active agent */}
      {getActiveAgent() && (
        <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2 bg-gray-800/50">
          <span className="text-lg">{getActiveAgent()?.icon}</span>
          <span className="text-sm text-gray-300">{getActiveAgent()?.name}</span>
          <span className="text-xs text-gray-500">· {getActiveAgent()?.model}</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {!chat || chat.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-2">
                <span className="text-gray-300">Blend</span>
              </h1>
              <p className="text-gray-500 mb-4">AI와 대화를 시작하세요</p>
              {getActiveAgent() && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900/30 rounded-lg text-sm text-blue-300">
                  <span className="text-lg">{getActiveAgent()?.icon}</span>
                  <span>에이전트: {getActiveAgent()?.name}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4 px-4">
            {chat.messages.map((msg) => (
              <div key={msg.id} className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isBlock = String(children).includes('\n');
                            if (isBlock || match) {
                              return <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>;
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
                      {imageGenEnabledForRender && (() => {
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
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(msg.id); }
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
                    <p className="whitespace-pre-wrap">{msg.content}</p>
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
                    {msg.role === 'assistant' && msg.id === chat.messages[chat.messages.length - 1]?.id && !isStreaming && (
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
                  </div>
                </div>
              </div>
            ))}
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
        <div className="px-4 py-2 bg-purple-900/20 border-t border-purple-800/30 flex items-center gap-2">
          <Image size={13} className="text-purple-400 animate-pulse" />
          <span className="text-xs text-purple-300">이미지 생성 중 (최대 30초)...</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-700 p-4 pb-4 mobile-input-area" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="max-w-3xl mx-auto">
          {/* Model selector */}
          <div className="flex items-center gap-2 mb-2 relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-800 text-sm text-gray-300 hover:bg-gray-700"
            >
              {model?.name || selectedModel}
              <ChevronDown size={14} />
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

            {/* Export button */}
            {chat && chat.messages.length > 0 && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                  title="내보내기"
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
              <div className="absolute bottom-8 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-64 max-h-80 overflow-y-auto">
                {enabledModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex justify-between ${
                      m.id === selectedModel ? 'bg-gray-700 text-blue-400' : 'text-gray-300'
                    }`}
                  >
                    <span>{m.name}</span>
                    <span className="text-xs text-gray-500">${m.inputPrice}/{m.outputPrice}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Text input */}
          <div className="flex items-end gap-2 bg-gray-800 rounded-xl p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isInstalled('image-gen') && isInstalled('web-search')
                  ? '메시지, URL, ?검색어, /image 프롬프트... (Shift+Enter로 줄바꿈)'
                  : isInstalled('image-gen')
                  ? '메시지 또는 /image 프롬프트를 입력하세요... (Shift+Enter로 줄바꿈)'
                  : isInstalled('web-search')
                  ? '메시지 또는 ?검색어, !search 검색어... (Shift+Enter로 줄바꿈)'
                  : isInstalled('url-reader')
                  ? '메시지 또는 URL을 입력하세요... (Shift+Enter로 줄바꿈)'
                  : '메시지를 입력하세요... (Shift+Enter로 줄바꿈)'
              }
              rows={1}
              className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 outline-none resize-none max-h-40 px-2 py-1"
              style={{ minHeight: '36px' }}
            />
            {isStreaming ? (
              <button onClick={handleStop} className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white">
                <Square size={18} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
