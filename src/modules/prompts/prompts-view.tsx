'use client';

import { useState, useRef } from 'react';
import { usePromptStore } from '@/stores/prompt-store';
import { Prompt } from '@/types';
import { Plus, Star, Search, Tag, Trash2, Edit3, Copy, X, Upload, Download, ChevronDown, MessageSquare } from 'lucide-react';
import { PromptVariableModal } from './prompt-variable-modal';

interface PromptsViewProps {
  onUsePrompt?: (content: string) => void;
  onStartChat?: (systemPrompt: string) => void;
}

export function PromptsView({ onUsePrompt, onStartChat }: PromptsViewProps) {
  const {
    searchQuery, selectedTag, setSearchQuery, setSelectedTag,
    getFilteredPrompts, getAllTags, addPrompt, deletePrompt, toggleFavorite, updatePrompt,
  } = usePromptStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [newPrompt, setNewPrompt] = useState({ title: '', content: '', tags: '' });
  const [variableModal, setVariableModal] = useState<{ prompt: Prompt } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const filteredPrompts = getFilteredPrompts();
  const allTags = getAllTags();

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

  const handleUse = (prompt: Prompt) => {
    if (prompt.variables && prompt.variables.length > 0) {
      // Open variable modal instead of using blocking window.prompt()
      setVariableModal({ prompt });
    } else {
      onUsePrompt?.(prompt.content);
    }
  };

  const handleVariableConfirm = (values: Record<string, string>) => {
    if (!variableModal) return;
    let content = variableModal.prompt.content;
    Object.entries(values).forEach(([key, val]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });
    onUsePrompt?.(content);
    setVariableModal(null);
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
            ? item.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];
          const variables = [...item.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
          addPrompt({ title: item.title.trim(), content: item.content.trim(), tags: tagList, variables, isFavorite: false });
          allTitles.add(item.title.trim());
          added++;
        });

        setImportResult(`${added}개 추가됨${skipped > 0 ? `, ${skipped}개 중복 건너뜀` : ''}`);
        setTimeout(() => setImportResult(null), 4000);
      } catch {
        setImportResult('파일 파싱 오류 — JSON 또는 CSV 형식인지 확인하세요');
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-on-surface">프롬프트 라이브러리</h1>
          <div className="flex items-center gap-2">
            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
                title="프롬프트 내보내기"
              >
                <Download size={16} /> 내보내기 <ChevronDown size={13} />
              </button>
              {showExportDropdown && (
                <div className="absolute top-10 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-40">
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
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
              title="JSON 또는 CSV 파일에서 프롬프트 가져오기"
            >
              <Upload size={16} /> 가져오기
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
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
            >
              <Plus size={16} /> 새 프롬프트
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
              placeholder="프롬프트 검색..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tag filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-full text-xs ${
              !selectedTag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            전체
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 ${
                selectedTag === tag ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Tag size={10} /> {tag}
            </button>
          ))}
        </div>

        {/* Prompt list */}
        <div className="space-y-3">
          {filteredPrompts.length === 0 ? (
            <div className="text-center text-on-surface-muted py-12">프롬프트가 없습니다</div>
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
                        title="이 프롬프트로 채팅 시작"
                      >
                        <MessageSquare size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleUse(prompt)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
                      title="클립보드에 복사"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => setEditingPrompt(prompt)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                      title="수정"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deletePrompt(prompt.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-on-surface-muted line-clamp-2 mb-2">{prompt.content}</p>
                <div className="flex items-center gap-2">
                  {prompt.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {prompt.variables && prompt.variables.length > 0 && (
                    <span className="text-xs text-blue-400">
                      {prompt.variables.length}개 변수
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
