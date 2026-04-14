'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, ToggleLeft, ToggleRight, FileSpreadsheet, AlertCircle, Sparkles, Loader } from 'lucide-react';
import { useDocumentStore } from '@/stores/document-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { parseDocument, generateEmbeddings } from '@/modules/plugins/document-plugin';
import { useTranslation } from '@/lib/i18n';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type EmbedStatus = 'idle' | 'embedding' | 'done' | 'error';

export function DocumentPluginView() {
  const { t } = useTranslation();
  const { documents, activeDocIds, addDocument, updateDocument, removeDocument, toggleActive } = useDocumentStore();
  const { getKey } = useAPIKeyStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-document embedding status & progress
  const [embedStatus, setEmbedStatus] = useState<Record<string, EmbedStatus>>({});
  const [embedProgress, setEmbedProgress] = useState<Record<string, number>>({});
  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Pick best available key for embeddings (OpenAI preferred, Google fallback)
  const embeddingKey = getKey('openai') || getKey('google') || '';
  const embeddingProvider: 'openai' | 'google' | null = getKey('openai')
    ? 'openai'
    : getKey('google')
    ? 'google'
    : null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['xlsx', 'xls', 'csv', 'txt', 'md', 'pdf'].includes(ext ?? '')) {
          setError(t('documents.unsupported_format', { name: file.name }));
          continue;
        }
        const doc = await parseDocument(file);
        addDocument(doc);

        // Auto-generate embeddings if an API key is available
        if (embeddingProvider) {
          setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'embedding' }));
          setEmbedProgress((prev) => ({ ...prev, [doc.id]: 0 }));
          generateEmbeddings(doc, embeddingKey, embeddingProvider, (pct) => {
            setEmbedProgress((prev) => ({ ...prev, [doc.id]: pct }));
          })
            .then((embedded) => {
              updateDocument(embedded);
              setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'done' }));
              setEmbedProgress((prev) => ({ ...prev, [doc.id]: 100 }));
            })
            .catch(() => {
              setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'error' }));
            });
        }
      }
    } catch (e: any) {
      setError(e.message || t('documents.unsupported_format', { name: '' }));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const embeddingProviderLabel = embeddingProvider === 'openai'
    ? 'OpenAI text-embedding-3-small'
    : embeddingProvider === 'google'
    ? 'Google text-embedding-004'
    : null;

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText size={24} /> {t('documents.page_title')}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {t('documents.page_subtitle')}
          </p>
          {embeddingProviderLabel ? (
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <Sparkles size={11} /> {t('documents.semantic_active', { provider: embeddingProviderLabel })}
            </p>
          ) : (
            <p className="text-xs text-yellow-500 mt-1">
              ⚠ {t('documents.no_api_key_warn')}
            </p>
          )}
        </div>

        {/* Upload area */}
        <div
          className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors mb-4"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={32} className="text-gray-500 mx-auto mb-3" />
          <p className="text-gray-300 text-sm font-medium">{t('documents.drop_or_click')}</p>
          <p className="text-gray-500 text-xs mt-1">{t('documents.supported_formats')}</p>
          {loading && <p className="text-blue-400 text-xs mt-2 animate-pulse">{t('documents.parsing')}</p>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.md,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2 mb-4">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Document list */}
        {documents.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-3">
              {t('documents.active_context')}
            </p>
            {documents.map((doc) => {
              const isActive = activeDocIds.has(doc.id);
              const status = embedStatus[doc.id] ?? (doc.embeddingModel ? 'done' : 'idle');
              const icon = ['xlsx', 'xls', 'csv'].includes(doc.type)
                ? <FileSpreadsheet size={18} className="text-green-400" />
                : <FileText size={18} className="text-blue-400" />;

              return (
                <div key={doc.id} className={`rounded-xl p-4 border transition-colors ${
                  isActive ? 'bg-blue-900/20 border-blue-500/40' : 'bg-gray-800 border-gray-700'
                }`}>
                  <div className="flex items-center gap-3">
                    {icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">
                          {t('documents.chunks_count', { count: doc.chunks.length, size: formatBytes(doc.totalChars) })}
                        </p>
                        {/* Embedding status badge */}
                        {status === 'embedding' && (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <Loader size={10} className="animate-spin" />
                            {t('documents.embedding')} {embedProgress[doc.id] ?? 0}%
                          </span>
                        )}
                        {status === 'done' && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <Sparkles size={10} />{t('documents.semantic_search')}
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="text-xs text-yellow-500">{t('documents.embed_error')}</span>
                        )}
                        {status === 'idle' && !embeddingProvider && (
                          <span className="text-xs text-gray-600">{t('documents.keyword_search')}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(doc.id)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        isActive
                          ? 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20'
                          : 'text-gray-500 bg-gray-700 hover:bg-gray-600'
                      }`}
                      title={isActive ? t('documents.deactivate') : t('documents.activate')}
                    >
                      {isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {isActive ? t('documents.active') : t('documents.inactive')}
                    </button>
                    {deleteConfirmId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">{t('documents.delete_confirm')}</span>
                        <button
                          onClick={() => { removeDocument(doc.id); setDeleteConfirmId(null); }}
                          className="px-2 py-0.5 rounded text-xs bg-red-600 text-white hover:bg-red-700"
                        >{t('documents.yes')}</button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600"
                        >{t('documents.cancel')}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(doc.id)}
                        className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                        title={t('documents.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600 text-sm">
            {t('documents.no_documents')}
          </div>
        )}

        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400 mb-2">{t('documents.search_method')}</p>
          <p>• <span className="text-green-400">{t('documents.semantic_search')}</span> — {t('documents.semantic_desc')}</p>
          <p>• <span className="text-gray-400">{t('documents.keyword_search')}</span> — {t('documents.keyword_desc')}</p>
          <p className="text-gray-600 mt-2">{t('documents.note_no_match')}</p>
          <p className="text-gray-600">{t('documents.note_browser_only')}</p>
        </div>
      </div>
    </div>
  );
}
