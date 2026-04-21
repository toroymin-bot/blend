'use client';

import { useChatStore } from '@/stores/chat-store';
import { useAgentStore } from '@/stores/agent-store';
import { downloadChat } from '@/modules/chat/export-chat';
import { ChatTags } from '@/modules/chat/chat-tags';
import { MessageSquare, Plus, Settings, Bot, BookText, Cpu, Trash2, BarChart3, PanelLeftClose, PanelLeft, Check, GitCompareArrows, Download, Edit3, Puzzle, Menu, X, Tag, Pin, PinOff, Folder, FolderPlus, ChevronRight, ChevronDown, ChevronLeft, FileText, HardDrive, Mic, Sparkles, Shield, CreditCard, Info, User } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

// Mobile bottom tab bar — 3 primary tabs
interface MobileBottomBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function MobileBottomBar({ activeTab, onTabChange }: MobileBottomBarProps) {
  const { t } = useTranslation();
  const mobileTabs = [
    { id: 'chat', icon: MessageSquare, label: t('mobile.chat') },
    { id: 'models', icon: Cpu, label: t('mobile.models') },
    { id: 'settings', icon: Settings, label: t('mobile.settings') },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border-token flex items-stretch justify-around" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* [2026-04-12 01:07] UX 개선: 모바일 터치 영역 최소 44px 확보 (WCAG 2.1) */}
      {mobileTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 py-3 min-h-[44px] transition-colors ${
            activeTab === tab.id
              ? 'text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {activeTab === tab.id && (
            <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-b-full bg-blue-400" />
          )}
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
  const { t } = useTranslation();
  const { chats, currentChatId, folders, createChat, setCurrentChat, deleteChat, updateChatTitle, getAllChatTags, togglePin, createFolder, deleteFolder, renameFolder, moveToFolder } = useChatStore();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const { activeAgentId, getActiveAgent } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderPopoverChatId, setFolderPopoverChatId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Cmd+K → focus sidebar search (dispatched from page.tsx)
  useEffect(() => {
    const handler = () => {
      setCollapsed(false);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    };
    window.addEventListener('blend:focus-sidebar-search', handler);
    return () => window.removeEventListener('blend:focus-sidebar-search', handler);
  }, []);

  // Global nav open event (from left-edge ">" button in page.tsx)
  useEffect(() => {
    const handler = () => setNavExpanded(true);
    window.addEventListener('blend:open-nav', handler);
    return () => window.removeEventListener('blend:open-nav', handler);
  }, []);

  // Close drawer when clicking outside sidebar
  useEffect(() => {
    if (!navExpanded) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setNavExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [navExpanded]);

  // Close profile popover when clicking outside
  useEffect(() => {
    if (!profilePopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfilePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profilePopoverOpen]);
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

  // [2026-04-16 01:00] disabled — Plugins menu hidden by request
  const PLUGINS_ENABLED = false; // [2026-04-16] disabled
  // [2026-04-16 01:00] disabled — Prompts menu hidden by request
  const PROMPTS_ENABLED = false; // [2026-04-16] disabled

  const tabs = [
    { id: 'chat', icon: MessageSquare, label: t('nav.chat'), desc: t('nav.chat_desc') },
    { id: 'compare', icon: GitCompareArrows, label: t('nav.compare'), desc: t('nav.compare_desc') },
    { id: 'documents', icon: FileText, label: t('nav.documents'), desc: t('nav.documents_desc') },
    { id: 'datasources', icon: HardDrive, label: t('nav.datasources'), desc: t('nav.datasources_desc') },
    { id: 'meeting', icon: Mic, label: t('nav.meeting'), desc: t('nav.meeting_desc') },
    { id: 'agents', icon: Bot, label: t('nav.agents'), desc: t('nav.agents_desc') },
    // [2026-04-16 01:00] disabled — { id: 'prompts', icon: BookText, label: t('nav.prompts'), desc: t('nav.prompts_desc') },
    ...(PROMPTS_ENABLED ? [{ id: 'prompts', icon: BookText, label: t('nav.prompts'), desc: t('nav.prompts_desc') }] : []),
    // [2026-04-16 01:00] disabled — { id: 'plugins', icon: Puzzle, label: t('nav.plugins'), desc: t('nav.plugins_desc') },
    ...(PLUGINS_ENABLED ? [{ id: 'plugins', icon: Puzzle, label: t('nav.plugins'), desc: t('nav.plugins_desc') }] : []),
    { id: 'models', icon: Cpu, label: t('nav.models'), desc: t('nav.models_desc') },
    // [2026-04-17] billing moved above savings
    { id: 'billing', icon: CreditCard, label: t('nav.billing'), desc: t('nav.billing_desc') },
  ];

  // [UI-01] Profile popover items — savings, dashboard, settings, security, about
  const profileTabs = [
    { id: 'savings',   icon: Sparkles,  label: t('sidebar.profile_savings') },
    { id: 'dashboard', icon: BarChart3, label: t('sidebar.profile_dashboard') },
    { id: 'settings',  icon: Settings,  label: t('sidebar.profile_settings') },
    { id: 'security',  icon: Shield,    label: t('sidebar.profile_security') },
    { id: 'about',     icon: Info,      label: t('sidebar.profile_about') },
  ];

  return (
    <div ref={sidebarRef} className="flex h-full relative">
      {/* Unified nav — expands inline from w-14 to w-60 */}
      <div className={`flex flex-col py-3 gap-1 relative flex-shrink-0 transition-all duration-200 border-r ${
        navExpanded
          ? 'w-60 bg-gray-900 border-white/10'
          : 'w-14 bg-surface border-border-token'
      }`}>

        {/* Scrollable tabs with bottom gradient fade */}
        <div className="relative flex-1 min-h-0 w-full flex flex-col">
          <div
            className={`h-full overflow-y-auto flex flex-col pb-10 gap-0.5 ${navExpanded ? 'px-2' : 'items-center px-2'}`}
            style={{ scrollbarWidth: 'none' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setNavExpanded(false);
                  if (activeTab === tab.id && tab.id === 'chat') {
                    setCollapsed(!collapsed);
                  } else {
                    onTabChange(tab.id);
                    if (tab.id === 'chat') setCollapsed(false);
                  }
                }}
                className={`flex items-center gap-3 rounded-lg transition-colors flex-shrink-0 ${
                  navExpanded
                    ? `w-full px-3 py-2.5 text-left ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`
                    : `w-10 h-10 justify-center ${activeTab === tab.id ? 'bg-surface-2 text-on-surface' : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-2'}`
                }`}
                title={!navExpanded ? tab.label : undefined}
              >
                <tab.icon size={20} className="flex-shrink-0" />
                {navExpanded && (
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight truncate">{tab.label}</div>
                    <div className={`text-xs leading-tight truncate mt-0.5 ${activeTab === tab.id ? 'text-blue-200' : 'text-gray-500'}`}>{tab.desc}</div>
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* Bottom gradient fade */}
          <div className={`absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t to-transparent pointer-events-none ${
            navExpanded ? 'from-gray-900 via-gray-900/80' : 'from-surface via-surface/80'
          }`} />
        </div>

        {/* Profile button with popover — replaces bottom 5 menu items (UI-01) */}
        <div ref={profileRef} className="relative flex-shrink-0 mx-2">
          <button
            onClick={() => setProfilePopoverOpen(!profilePopoverOpen)}
            className={`flex items-center gap-3 rounded-lg transition-colors ${
              navExpanded
                ? `w-full px-3 py-2.5 text-left ${profileTabs.some(p => p.id === activeTab) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`
                : `w-10 h-10 justify-center ${profileTabs.some(p => p.id === activeTab) ? 'bg-surface-2 text-on-surface' : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-2'}`
            }`}
            title={!navExpanded ? t('sidebar.profile_button') : undefined}
          >
            <User size={20} className="flex-shrink-0" />
            {navExpanded && (
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight truncate">{t('sidebar.profile_button')}</div>
                <div className={`text-xs leading-tight truncate mt-0.5 ${profileTabs.some(p => p.id === activeTab) ? 'text-blue-200' : 'text-gray-500'}`}>
                  {profileTabs.find(p => p.id === activeTab)?.label ?? ''}
                </div>
              </div>
            )}
          </button>
          {/* Popover */}
          {profilePopoverOpen && (
            <div className={`absolute bottom-full mb-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 w-48 flex flex-col ${navExpanded ? 'left-0' : 'left-full ml-2'}`}>
              {profileTabs.map((pt) => (
                <button
                  key={pt.id}
                  onClick={() => { onTabChange(pt.id); setProfilePopoverOpen(false); setNavExpanded(false); }}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                    activeTab === pt.id ? 'text-blue-400 bg-blue-500/10' : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <pt.icon size={16} className="flex-shrink-0" />
                  {pt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active agent indicator */}
        {activeAgent && (
          <div
            className={`flex items-center rounded-lg bg-blue-900/50 flex-shrink-0 mx-2 ${navExpanded ? 'px-3 py-2 gap-3' : 'w-10 h-10 justify-center'}`}
            title={t('sidebar.agent_label', { name: activeAgent.name })}
          >
            <span className="text-lg">{activeAgent.icon || '🤖'}</span>
            {navExpanded && <span className="text-sm text-blue-300 truncate">{activeAgent.name}</span>}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-3 rounded-lg text-on-surface-muted hover:text-on-surface hover:bg-surface-2 flex-shrink-0 mx-2 transition-colors ${
            navExpanded ? 'px-3 py-2' : 'w-10 h-10 justify-center'
          }`}
          title={collapsed ? t('sidebar.expand_list') : t('sidebar.collapse_list')}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {navExpanded && <span className="text-sm">{collapsed ? t('sidebar.expand_list') : t('sidebar.collapse_list')}</span>}
        </button>

        {/* Toggle button on right edge:
            - expanded OR mobileOpen: always visible so user can toggle
            - collapsed + sidebar closed on mobile: hidden (avoids leaking outside off-screen sidebar) */}
        <button
          onClick={() => setNavExpanded(!navExpanded)}
          className={`${navExpanded || mobileOpen ? 'flex' : 'hidden md:flex'} absolute right-0 top-1/2 -translate-y-1/2 translate-x-full w-[18px] h-24 bg-gray-600 hover:bg-gray-400 items-center justify-center text-white z-10 transition-colors rounded-r-full`}
          title={navExpanded ? t('sidebar.menu_collapse') : t('sidebar.menu_expand')}
        >
          {navExpanded ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
        </button>
      </div>

      {/* Chat list panel */}
      {activeTab === 'chat' && !collapsed && (
        <div className="w-60 bg-surface-2 border-r border-border-token flex flex-col">
          <div className="p-3 border-b border-border-token space-y-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { createChat(); onTabChange('chat'); }}
                className="flex-shrink-0 w-7 h-7 rounded-md bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white"
                title={t('sidebar.new_chat')}
              >
                <Plus size={14} />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur(); } }}
                placeholder={t('sidebar.search_placeholder')}
                className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {/* Date filter buttons */}
            <div className="flex gap-1">
              {([
                { id: 'today', label: t('sidebar.today') },
                { id: 'week', label: t('sidebar.this_week') },
                { id: 'month', label: t('sidebar.this_month') },
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
                  {t('sidebar.all')}
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
                {searchQuery ? t('sidebar.no_results') : t('sidebar.no_chats')}
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
                      {t('sidebar.messages_count', { count: chat.messages.length })}
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
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 touch-visible transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(chat.id); }}
                      className={`p-1 ${chat.pinned ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                      title={chat.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
                    >
                      {chat.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFolderPopoverChatId(folderPopoverChatId === chat.id ? null : chat.id); }}
                        className="text-gray-500 hover:text-blue-400 p-1"
                        title={t('sidebar.move_to_folder')}
                      >
                        <Folder size={12} />
                      </button>
                      {folderPopoverChatId === chat.id && (
                        <div className="absolute right-0 top-6 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 w-40" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                            onClick={() => { moveToFolder(chat.id, undefined); setFolderPopoverChatId(null); }}
                          >{t('sidebar.no_folder')}</button>
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
                      title={t('sidebar.edit_title')}
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadChat(chat, 'md'); }}
                      className="text-gray-500 hover:text-blue-400 p-1"
                      title={t('sidebar.export_chat')}
                    >
                      <Download size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                      className="text-gray-500 hover:text-red-400 p-1"
                      title={t('sidebar.delete_chat')}
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
                        <Pin size={10} />{t('sidebar.pinned')}
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
                            title={t('sidebar.rename_folder')}
                          ><Edit3 size={10} /></button>
                          <button
                            className="opacity-0 group-hover/folder:opacity-100 text-gray-500 hover:text-red-400 p-0.5"
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            title={t('sidebar.delete_folder')}
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
                          <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">{t('sidebar.others')}</div>
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
                  placeholder={t('sidebar.folder_name_placeholder')}
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
                <FolderPlus size={13} />{t('sidebar.new_folder')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
