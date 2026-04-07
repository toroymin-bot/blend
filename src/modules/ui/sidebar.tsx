'use client';

import { useChatStore } from '@/stores/chat-store';
import { useAgentStore } from '@/stores/agent-store';
import { downloadChat } from '@/modules/chat/export-chat';
import { ChatTags } from '@/modules/chat/chat-tags';
import { MessageSquare, Plus, Settings, Bot, BookText, Cpu, Trash2, BarChart3, PanelLeftClose, PanelLeft, Check, GitCompareArrows, Download, Edit3, Puzzle, Menu, X, Tag } from 'lucide-react';
import { useState, useMemo } from 'react';

// Mobile bottom tab bar — 3 primary tabs
interface MobileBottomBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function MobileBottomBar({ activeTab, onTabChange }: MobileBottomBarProps) {
  const mobileTabs = [
    { id: 'chat', icon: MessageSquare, label: '채팅' },
    { id: 'models', icon: Cpu, label: '모델' },
    { id: 'settings', icon: Settings, label: '설정' },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 flex items-center justify-around px-4 py-2 safe-area-inset-bottom">
      {mobileTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
            activeTab === tab.id
              ? 'text-blue-400 bg-blue-400/10'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <tab.icon size={20} />
          <span className="text-xs">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  mobileOpen?: boolean;
  onMobileToggle?: () => void;
}

export function Sidebar({ activeTab, onTabChange, mobileOpen, onMobileToggle }: SidebarProps) {
  const { chats, currentChatId, createChat, setCurrentChat, deleteChat, updateChatTitle, getAllChatTags } = useChatStore();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const { activeAgentId, getActiveAgent } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const allChatTags = getAllChatTags();

  const filteredChats = useMemo(() => {
    let list = chats;
    if (activeTagFilter) {
      list = list.filter((c) => (c.tags ?? []).includes(activeTagFilter));
    }
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [chats, searchQuery, activeTagFilter]);

  const activeAgent = getActiveAgent();

  const tabs = [
    { id: 'chat', icon: MessageSquare, label: '채팅' },
    { id: 'agents', icon: Bot, label: '에이전트' },
    { id: 'prompts', icon: BookText, label: '프롬프트' },
    { id: 'plugins', icon: Puzzle, label: '플러그인' },
    { id: 'models', icon: Cpu, label: '모델' },
    { id: 'compare', icon: GitCompareArrows, label: '모델 비교' },
    { id: 'dashboard', icon: BarChart3, label: '비용 분석' },
    { id: 'settings', icon: Settings, label: '설정' },
  ];

  return (
    <div className="flex h-full">
      {/* Icon bar */}
      <div className="w-14 bg-gray-900 flex flex-col items-center py-3 gap-1 border-r border-gray-800">
        <button
          onClick={() => {
            createChat();
            onTabChange('chat');
          }}
          className="w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white mb-2"
          title="새 채팅 (⌘N)"
        >
          <Plus size={20} />
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeTab === tab.id && tab.id === 'chat') {
                setCollapsed(!collapsed);
              } else {
                onTabChange(tab.id);
                if (tab.id === 'chat') setCollapsed(false);
              }
            }}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              activeTab === tab.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title={tab.label}
          >
            <tab.icon size={20} />
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Active agent indicator */}
        {activeAgent && (
          <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center text-lg" title={`에이전트: ${activeAgent.name}`}>
            {activeAgent.icon || '🤖'}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-10 h-10 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 flex items-center justify-center"
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Chat list panel */}
      {activeTab === 'chat' && !collapsed && (
        <div className="w-60 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700 space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="대화 검색... (⌘K)"
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
            />
            {allChatTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setActiveTagFilter(null)}
                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                    !activeTagFilter ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  전체
                </button>
                {allChatTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-colors ${
                      activeTagFilter === tag ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <Tag size={9} />
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? '검색 결과 없음' : '대화가 없습니다'}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setCurrentChat(chat.id)}
                  className={`group px-3 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                    currentChatId === chat.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {editingChatId === chat.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => {
                          if (editTitle.trim()) updateChatTitle(chat.id, editTitle.trim());
                          setEditingChatId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editTitle.trim()) updateChatTitle(chat.id, editTitle.trim());
                            setEditingChatId(null);
                          }
                          if (e.key === 'Escape') setEditingChatId(null);
                        }}
                        autoFocus
                        className="w-full bg-gray-600 rounded px-1 py-0.5 text-sm text-gray-200 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm text-gray-200 truncate">{chat.title}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {chat.messages.length}개 메시지
                      {chat.model && <span className="ml-1 text-gray-600">· {chat.model}</span>}
                    </p>
                    {(chat.tags ?? []).length > 0 && (
                      <div
                        className="mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ChatTags chatId={chat.id} tags={chat.tags} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChatId(chat.id);
                        setEditTitle(chat.title);
                      }}
                      className="text-gray-500 hover:text-gray-300 p-1"
                      title="제목 수정"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadChat(chat, 'md');
                      }}
                      className="text-gray-500 hover:text-blue-400 p-1"
                      title="내보내기"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      className="text-gray-500 hover:text-red-400 p-1"
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
