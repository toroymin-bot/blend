'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePromptStore } from '@/stores/prompt-store';
import { Prompt } from '@/types';
import { Plus, Star, Search, Tag, Trash2, Edit3, Copy, X, Upload, Download, ChevronDown, MessageSquare } from 'lucide-react';
import { PromptVariableModal } from './prompt-variable-modal';
import { useTranslation } from '@/lib/i18n';

interface PromptsViewProps {
  onUsePrompt?: (content: string) => void;
  onStartChat?: (systemPrompt: string) => void;
}

export function PromptsView({ onUsePrompt, onStartChat }: PromptsViewProps) {
  const { t } = useTranslation();
  const {
    searchQuery, selectedTag, setSearchQuery, setSelectedTag,
    getFilteredPrompts, getAllTags, addPrompt, deletePrompt, toggleFavorite, updatePrompt,
  } = usePromptStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [newPrompt, setNewPrompt] = useState({ title: '', content: '', tags: '' });
  const [variableModal, setVariableModal] = useState<{ prompt: Prompt; copyOnly?: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [allActive, setAllActive] = useState(true);
  const importFileRef = useRef<HTMLInputElement>(null);
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const [tagFade, setTagFade] = useState({ left: false, right: true });

  const filteredPrompts = getFilteredPrompts();
  const allTags = getAllTags();

  useEffect(() => {
    const el = tagScrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setTagFade({
        left: scrollLeft > 8,
        right: scrollLeft < scrollWidth - clientWidth - 8,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // 태그 목록 변경 시 재계산
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [allTags.length]);

  const handleCreate = () => {
    if (!newPrompt.title.trim() || !newPrompt.content.trim()) return;
    const variables = [...newPrompt.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    addPrompt({
      title: newPrompt.title,
      content: newPrompt.content,
      tags: newPrompt.tags.split(',').map((t) => t.trim()).filter(Boolean),
      variables,
      isFavorite: false,
    });
    setNewPrompt({ title: '', content: '', tags: '' });
    setShowCreateModal(false);
  };

  const copyToClipboard = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleUse = (prompt: Prompt) => {
    if (prompt.variables && prompt.variables.length > 0) {
      setVariableModal({ prompt });
    } else if (onUsePrompt) {
      onUsePrompt(prompt.content);
    } else {
      // Fallback: copy to clipboard
      copyToClipboard(prompt.content, prompt.id);
    }
  };

  const handleVariableConfirm = (values: Record<string, string>) => {
    if (!variableModal) return;
    let content = variableModal.prompt.content;
    Object.entries(values).forEach(([key, val]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });
    if (variableModal.copyOnly || !onUsePrompt) {
      copyToClipboard(content, variableModal.prompt.id);
    } else {
      onUsePrompt(content);
    }
    setVariableModal(null);
  };

  const handleCopyPrompt = (prompt: Prompt) => {
    if (prompt.variables && prompt.variables.length > 0) {
      setVariableModal({ prompt, copyOnly: true });
    } else {
      copyToClipboard(prompt.content, prompt.id);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const existingTitles = new Set(filteredPrompts.map((p) => p.title));
        // Use the full list for duplicate checking
        const { prompts: allPrompts } = usePromptStore.getState();
        const allTitles = new Set(allPrompts.map((p) => p.title));

        let items: { title: string; content: string; tags?: string }[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          items = Array.isArray(parsed) ? parsed : [];
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter((l) => l.trim());
          if (lines.length < 2) return;
          const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          const titleIdx = headers.indexOf('title');
          const contentIdx = headers.indexOf('content');
          const tagsIdx = headers.indexOf('tags');
          for (let i = 1; i < lines.length; i++) {
            // Simple CSV parse (handles quoted fields)
            const cols = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g) ?? [];
            const clean = (s: string) => s.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            if (titleIdx >= 0 && contentIdx >= 0) {
              items.push({
                title: clean(cols[titleIdx] ?? ''),
                content: clean(cols[contentIdx] ?? ''),
                tags: tagsIdx >= 0 ? clean(cols[tagsIdx] ?? '') : '',
              });
            }
          }
        }

        let added = 0;
        let skipped = 0;
        items.forEach((item) => {
          if (!item.title?.trim() || !item.content?.trim()) return;
          if (allTitles.has(item.title.trim())) { skipped++; return; }
          const tagList = item.tags
            ? item.tags.split(',').map((tg: string) => tg.trim()).filter(Boolean)
            : [];
          const variables = [...item.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
          addPrompt({ title: item.title.trim(), content: item.content.trim(), tags: tagList, variables, isFavorite: false });
          allTitles.add(item.title.trim());
          added++;
        });

        const addedMsg = t('prompts.import_added', { count: added });
        const skippedMsg = skipped > 0 ? `, ${t('prompts.import_skipped', { skipped })}` : '';
        setImportResult(`${addedMsg}${skippedMsg}`);
        setTimeout(() => setImportResult(null), 4000);
      } catch {
        setImportResult(t('prompts.import_error'));
        setTimeout(() => setImportResult(null), 4000);
      }
      // Reset input so the same file can be imported again if needed
      if (importFileRef.current) importFileRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleExportJSON = () => {
    const { prompts: allPrompts } = usePromptStore.getState();
    const data = allPrompts.map(({ title, content, tags }) => ({ title, content, tags }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.json';
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  const handleExportCSV = () => {
    const { prompts: allPrompts } = usePromptStore.getState();
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [
      ['title', 'content', 'tags'].map(escape).join(','),
      ...allPrompts.map((p) => [p.title, p.content, p.tags.join(',')].map(escape).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.csv';
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl mx-auto">
        {/* 헤더: 모바일에서 타이틀 한 줄 + 버튼들 한 줄 분리 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
          <h1 className="text-xl font-bold text-on-surface whitespace-nowrap">{t('prompts.library_title')}</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                title={t('prompts.export')}
              >
                <Download size={14} /> <span className="hidden sm:inline">{t('prompts.export')}</span> <ChevronDown size={11} />
              </button>
              {showExportDropdown && (
                <div className="absolute top-9 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-36">
                  <button
                    onClick={handleExportJSON}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg"
                  >
                    JSON (.json)
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-b-lg"
                  >
                    CSV (.csv)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => importFileRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
              title={t('prompts.import')}
            >
              <Upload size={14} /> <span className="hidden sm:inline">{t('prompts.import')}</span><span className="sm:hidden">{t('prompts.import')}</span>
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,.csv"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white whitespace-nowrap"
            >
              <Plus size={14} /> {t('prompts.new_prompt')}
            </button>
          </div>
        </div>

        {/* Import result toast */}
        {importResult && (
          <div className="mb-4 px-4 py-2 bg-green-700/80 text-green-100 text-sm rounded-lg">
            {importResult}
          </div>
        )}

        {/* Search + Tags */}
        <div className="mb-4 flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('prompts.search_placeholder')}
              className="w-full pl-9 pr-3 py-2 bg-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tag filter — 가로 스크롤 1줄 + 양쪽 페이드 힌트 */}
        <div className="relative mb-4">
          {/* 왼쪽 페이드 — 스크롤 후 표시 */}
          <div
            className="absolute left-0 top-0 bottom-1 w-8 pointer-events-none z-10 transition-opacity duration-200"
            style={{
              background: 'linear-gradient(to right, var(--surface), transparent)',
              opacity: tagFade.left ? 1 : 0,
            }}
          />
          {/* 오른쪽 페이드 — 더 스크롤할 내용이 있을 때 */}
          <div
            className="absolute right-0 top-0 bottom-1 w-12 pointer-events-none z-10 transition-opacity duration-200"
            style={{
              background: 'linear-gradient(to left, var(--surface), transparent)',
              opacity: tagFade.right ? 1 : 0,
            }}
          />
        <div ref={tagScrollRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <button
            onClick={() => {
              if (allActive && !selectedTag) {
                setAllActive(false);
              } else {
                setAllActive(true);
                setSelectedTag(null);
              }
            }}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs ${
              allActive && !selectedTag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t('prompts.all')}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                if (selectedTag === tag) {
                  setSelectedTag(null);
                  setAllActive(true);
                } else {
                  setSelectedTag(tag);
                  setAllActive(false);
                }
              }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs flex items-center gap-1 ${
                (allActive && !selectedTag) || selectedTag === tag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Tag size={10} /> {tag}
            </button>
          ))}
        </div>
        </div>

        {/* Prompt list */}
        <div className="space-y-3">
          {filteredPrompts.length === 0 ? (
            <div className="text-center text-on-surface-muted py-12">{t('prompts.no_prompts')}</div>
          ) : (
            filteredPrompts.map((prompt) => (
              <div key={prompt.id} className="bg-surface-2 rounded-xl p-4 group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFavorite(prompt.id)}
                      className={prompt.isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}
                    >
                      <Star size={16} fill={prompt.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <h3 className="font-medium text-on-surface">{prompt.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onStartChat && (
                      <button
                        onClick={() => onStartChat(prompt.content)}
                        className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded"
                        title={t('prompts.start_chat')}
                      >
                        <MessageSquare size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyPrompt(prompt)}
                      className={`p-1.5 hover:bg-gray-700 rounded transition-colors ${copiedId === prompt.id ? 'text-green-400' : 'text-gray-400 hover:text-blue-400'}`}
                      title={t('prompts.copy')}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => setEditingPrompt(prompt)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                      title={t('prompts.edit')}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deletePrompt(prompt.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                      title={t('prompts.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm mb-2" style={{ color: '#c7c7cc' }}>{prompt.description || prompt.content}</p>
                <div className="flex items-center gap-2">
                  {prompt.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {prompt.variables && prompt.variables.length > 0 && (
                    <span className="text-xs text-blue-400">
                      {t('prompts.variables_count', { count: prompt.variables.length })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Prompt Variable Modal */}
        {variableModal && (
          <PromptVariableModal
            title={variableModal.prompt.title}
            variables={variableModal.prompt.variables ?? []}
            onConfirm={handleVariableConfirm}
            onClose={() => setVariableModal(null)}
          />
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">새 프롬프트</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newPrompt.title}
                  onChange={(e) => setNewPrompt({ ...newPrompt, title: e.target.value })}
                  placeholder="제목"
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <textarea
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
                  placeholder="프롬프트 내용 (변수는 {{변수명}} 형식)"
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none resize-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newPrompt.tags}
                  onChange={(e) => setNewPrompt({ ...newPrompt, tags: e.target.value })}
                  placeholder="태그 (쉼표로 구분)"
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
                >
                  취소
                </button>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
                >
                  생성
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
