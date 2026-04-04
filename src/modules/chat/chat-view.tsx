'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { sendChatRequest } from './chat-api';
import { getModelById, calculateCost, DEFAULT_MODELS } from '@/modules/models/model-registry';
import { ChatMessage } from '@/types';
import { Send, Square, ChevronDown, Copy, Check, RefreshCw, GitFork } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

export function ChatView() {
  const { currentChatId, selectedModel, setSelectedModel, addMessage, getCurrentChat, createChat, removeLastMessage, forkChat } = useChatStore();
  const { getKey, hasKey } = useAPIKeyStore();
  const { getActiveAgent } = useAgentStore();
  const { addRecord } = useUsageStore();
  const { systemPrompt } = useSettingsStore();
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      createdAt: Date.now(),
    };
    addMessage(chatId, userMsg);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    const activeAgent = getActiveAgent();
    const allMessages: { role: string; content: string }[] = [];
    const sysPrompt = activeAgent?.systemPrompt || systemPrompt;
    if (sysPrompt) {
      allMessages.push({ role: 'system', content: sysPrompt });
    }
    allMessages.push(...[...(chat?.messages || []), userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    })));

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
        setStreamingText((prev) => prev + text);
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
        setStreamingText('');
        setIsStreaming(false);
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
                    {msg.role === 'assistant' && msg.id === chat.messages[chat.messages.length - 1]?.id && !isStreaming && (
                      <button
                        onClick={() => {
                          removeLastMessage(currentChatId!);
                          const lastUserMsg = chat.messages.filter((m) => m.role === 'user').pop();
                          if (lastUserMsg) {
                            setInput(lastUserMsg.content);
                          }
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

      {/* Input area */}
      <div className="border-t border-gray-700 p-4">
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
              placeholder='메시지를 입력하세요... (Shift+Enter로 줄바꿈)'
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
