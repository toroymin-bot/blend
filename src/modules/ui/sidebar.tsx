'use client';

import { useChatStore } from '@/stores/chat-store';
import { useAgentStore } from '@/stores/agent-store';
import { downloadChat } from '@/modules/chat/export-chat';
import { ChatTags } from '@/modules/chat/chat-tags';
import { MessageSquare, Plus, Settings, Bot, BookText, Cpu, Trash2, BarChart3, PanelLeftClose, PanelLeft, Check, GitCompareArrows, Download, Edit3, Puzzle, Menu, X, Tag, Pin, PinOff, Folder, FolderPlus, ChevronRight, ChevronDown } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';

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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border-token flex items-center justify-around px-4 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
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
  const { chats, currentChatId, folders, createChat, setCurrentChat, deleteChat, updateChatTitle, getAllChatTags, togglePin, createFolder, deleteFolder, renameFolder, moveToFolder } = useChatStore();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const { activeAgentId, getActiveAgent } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderPopoverChatId, setFolderPopoverChatId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Cmd+K → focus sidebar search (dispatched from page.tsx)
  useEffect(() => {
    const handler = () => {
      setCollapsed(false);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    };
    window.addEventListener('blend:focus-sidebar-search', handler);
    return () => window.removeEventListener('blend:focus-sidebar-search', handler);
  }, []);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | null>(null);

  const allChatTags = getAllChatTags();

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const filteredChats = useMemo(() => {
    let list = chats;

    // Date filter
    if (dateFilter) {
      const now = Date.now();
      const DAY = 86400000;
      let cutoff: number;
      if (dateFilter === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
      } else if (dateFilter === 'week') {
        cutoff = now - 7 * DAY;
      } else {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
      }
      list = list.filter((c) => c.updatedAt >= cutoff);
    }

    if (activeTagFilter) {
      list = list.filter((c) => (c.tags ?? []).includes(activeTagFilter));
    }
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [chats, searchQuery, activeTagFilter, dateFilter]);

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
      <div className="w-14 bg-surface flex flex-col items-center py-3 gap-1 border-r border-border-token">
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
              activeTab === tab.id ? 'bg-surface-2 text-on-surface' : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-2'
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
          className="w-10 h-10 rounded-lg text-on-surface-muted hover:text-on-surface hover:bg-surface-2 flex items-center justify-center"
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Chat list panel */}
      {activeTab === 'chat' && !collapsed && (
        <div className="w-60 bg-surface-2 border-r border-border-token flex flex-col">
          <div className="p-3 border-b border-border-token space-y-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur(); } }}
              placeholder="대화 검색... (⌘K)"
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
            />
            {/* Date filter buttons */}
            <div className="flex gap-1">
              {([
                { id: 'today', label: '오늘' },
                { id: 'week', label: '이번 주' },
                { id: 'month', label: '이번 달' },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(dateFilter === f.id ? null : f.id)}
                  className={`flex-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
                    dateFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
          <div className="flex-1 overflow-y-auto" onClick={() => setFolderPopoverChatId(null)}>
            {filteredChats.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? '검색 결과 없음' : '대화가 없습니다'}
              </div>
            ) : (() => {
              const pinned = filteredChats.filter((c) => c.pinned);
              const unpinned = filteredChats.filter((c) => !c.pinned);

              const renderChat = (chat: (typeof filteredChats)[0]) => (
                <div
                  key={chat.id}
                  onClick={() => setCurrentChat(chat.id)}
                  className={`group px-3 py-2.5 cursor-pointer flex items-center justify-between transition-colors relative ${
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
                    {searchQuery && (() => {
                      const q = searchQuery.toLowerCase();
                      const matched = chat.messages.find((m) => m.content.toLowerCase().includes(q));
                      if (!matched) return null;
                      const idx = matched.content.toLowerCase().indexOf(q);
                      const start = Math.max(0, idx - 10);
                      const snippet = (start > 0 ? '…' : '') + matched.content.substring(start, start + 60) + (matched.content.length > start + 60 ? '…' : '');
                      return <p className="text-xs text-blue-400 truncate mt-0.5">{snippet}</p>;
                    })()}
                    {(chat.tags ?? []).length > 0 && (
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <ChatTags chatId={chat.id} tags={chat.tags} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(chat.id); }}
                      className={`p-1 ${chat.pinned ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                      title={chat.pinned ? '고정 해제' : '고정'}
                    >
                      {chat.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFolderPopoverChatId(folderPopoverChatId === chat.id ? null : chat.id); }}
                        className="text-gray-500 hover:text-blue-400 p-1"
                        title="폴더 이동"
                      >
                        <Folder size={12} />
                      </button>
                      {folderPopoverChatId === chat.id && (
                        <div className="absolute right-0 top-6 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 w-40" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                            onClick={() => { moveToFolder(chat.id, undefined); setFolderPopoverChatId(null); }}
                          >폴더 없음</button>
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${chat.folderId === f.id ? 'text-blue-400' : 'text-gray-300'}`}
                              onClick={() => { moveToFolder(chat.id, f.id); setFolderPopoverChatId(null); }}
                            >
                              {chat.folderId === f.id && <Check size={10} className="inline mr-1" />}{f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); }}
                      className="text-gray-500 hover:text-gray-300 p-1"
                      title="제목 수정"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadChat(chat, 'md'); }}
                      className="text-gray-500 hover:text-blue-400 p-1"
                      title="내보내기"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      className="text-gray-500 hover:text-red-400 p-1"
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );

              return (
                <>
                  {/* Pinned section */}
                  {pinned.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-yellow-500/80 font-medium">
                        <Pin size={10} />고정됨
                      </div>
                      {pinned.map(renderChat)}
                    </div>
                  )}

                  {/* Folders */}
                  {folders.map((folder) => {
                    const folderChats = unpinned.filter((c) => c.folderId === folder.id);
                    const isFolderCollapsed = collapsedFolders.has(folder.id);
                    return (
                      <div key={folder.id}>
                        <div className="group/folder px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-400 font-medium hover:bg-gray-700/30 cursor-pointer"
                          onClick={() => toggleFolderCollapsed(folder.id)}>
                          {isFolderCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          <Folder size={12} className="text-blue-400/70" />
                          {editingFolderId === folder.id ? (
                            <input
                              autoFocus
                              value={editFolderName}
                              onChange={(e) => setEditFolderName(e.target.value)}
                              onBlur={() => { if (editFolderName.trim()) renameFolder(folder.id, editFolderName.trim()); setEditingFolderId(null); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { if (editFolderName.trim()) renameFolder(folder.id, editFolderName.trim()); setEditingFolderId(null); }
                                if (e.key === 'Escape') setEditingFolderId(null);
                              }}
                              className="flex-1 bg-gray-600 rounded px-1 text-xs text-gray-200 outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="flex-1 truncate">{folder.name}</span>
                          )}
                          <span className="text-gray-600 text-xs">{folderChats.length}</span>
                          <button
                            className="opacity-0 group-hover/folder:opacity-100 text-gray-500 hover:text-gray-300 p-0.5"
                            onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                            title="폴더 이름 변경"
                          ><Edit3 size={10} /></button>
                          <button
                            className="opacity-0 group-hover/folder:opacity-100 text-gray-500 hover:text-red-400 p-0.5"
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            title="폴더 삭제"
                          ><Trash2 size={10} /></button>
                        </div>
                        {!isFolderCollapsed && folderChats.map(renderChat)}
                      </div>
                    );
                  })}

                  {/* Unfoldered, unpinned */}
                  {(() => {
                    const ungrouped = unpinned.filter((c) => !c.folderId);
                    if (ungrouped.length === 0) return null;
                    return (
                      <div>
                        {(folders.length > 0 || pinned.length > 0) && (
                          <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">기타</div>
                        )}
                        {ungrouped.map(renderChat)}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>

          {/* New folder input */}
          <div className="border-t border-border-token p-2">
            {showNewFolder ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) { createFolder(newFolderName.trim()); setNewFolderName(''); setShowNewFolder(false); }
                    if (e.key === 'Escape') { setNewFolderName(''); setShowNewFolder(false); }
                  }}
                  placeholder="폴더 이름..."
                  className="flex-1 px-2 py-1 bg-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 outline-none"
                />
                <button
                  onClick={() => { if (newFolderName.trim()) { createFolder(newFolderName.trim()); setNewFolderName(''); setShowNewFolder(false); } }}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white"
                ><Check size={12} /></button>
                <button
                  onClick={() => { setNewFolderName(''); setShowNewFolder(false); }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-400"
                ><X size={12} /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded transition-colors"
              >
                <FolderPlus size={13} />새 폴더
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
