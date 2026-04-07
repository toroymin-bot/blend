'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, ToggleLeft, ToggleRight, FileSpreadsheet, AlertCircle, Sparkles, Loader } from 'lucide-react';
import { useDocumentStore } from '@/stores/document-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { parseDocument, generateEmbeddings } from '@/modules/plugins/document-plugin';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type EmbedStatus = 'idle' | 'embedding' | 'done' | 'error';

export function DocumentPluginView() {
  const { documents, activeDocIds, addDocument, updateDocument, removeDocument, toggleActive } = useDocumentStore();
  const { getKey } = useAPIKeyStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-document embedding status
  const [embedStatus, setEmbedStatus] = useState<Record<string, EmbedStatus>>({});

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
          setError(`지원하지 않는 파일 형식: ${file.name} (xlsx, xls, csv, txt, md, pdf만 가능)`);
          continue;
        }
        const doc = await parseDocument(file);
        addDocument(doc);

        // Auto-generate embeddings if an API key is available
        if (embeddingProvider) {
          setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'embedding' }));
          generateEmbeddings(doc, embeddingKey, embeddingProvider)
            .then((embedded) => {
              updateDocument(embedded);
              setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'done' }));
            })
            .catch(() => {
              setEmbedStatus((prev) => ({ ...prev, [doc.id]: 'error' }));
            });
        }
      }
    } catch (e: any) {
      setError(e.message || '파일 파싱 오류');
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
            <FileText size={24} /> 문서 검색 (RAG)
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            엑셀, CSV, 텍스트 파일을 업로드하고 채팅으로 내용을 검색하세요
          </p>
          {embeddingProviderLabel ? (
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <Sparkles size={11} /> 시맨틱 검색 활성 — {embeddingProviderLabel}
            </p>
          ) : (
            <p className="text-xs text-yellow-500 mt-1">
              ⚠ API 키 없음 — 키워드 검색만 사용됩니다 (설정에서 OpenAI 또는 Google 키 입력)
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
          <p className="text-gray-300 text-sm font-medium">파일을 드래그하거나 클릭하여 업로드</p>
          <p className="text-gray-500 text-xs mt-1">.xlsx · .xls · .csv · .txt · .md · .pdf</p>
          {loading && <p className="text-blue-400 text-xs mt-2 animate-pulse">파싱 중...</p>}
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
              활성화된 문서는 채팅 질문과 관련된 내용을 자동으로 AI 컨텍스트에 포함합니다
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
                          {doc.chunks.length}개 청크 · {formatBytes(doc.totalChars)}
                        </p>
                        {/* Embedding status badge */}
                        {status === 'embedding' && (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <Loader size={10} className="animate-spin" />임베딩 중...
                          </span>
                        )}
                        {status === 'done' && (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <Sparkles size={10} />시맨틱 검색
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="text-xs text-yellow-500">키워드 검색 (임베딩 실패)</span>
                        )}
                        {status === 'idle' && !embeddingProvider && (
                          <span className="text-xs text-gray-600">키워드 검색</span>
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
                      title={isActive ? '비활성화' : '활성화'}
                    >
                      {isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {isActive ? '활성' : '비활성'}
                    </button>
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600 text-sm">
            업로드된 문서가 없습니다
          </div>
        )}

        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400 mb-2">검색 방식</p>
          <p>• <span className="text-green-400">시맨틱 검색</span> — OpenAI/Google 임베딩 API 사용. 의미 기반으로 관련 내용 검색 (추천)</p>
          <p>• <span className="text-gray-400">키워드 검색</span> — API 키 없을 때 자동 사용. 단어 일치 기반</p>
          <p className="text-gray-600 mt-2">* 관련 내용이 없으면 AI가 &apos;문서에서 찾을 수 없습니다&apos;라고 답변합니다</p>
          <p className="text-gray-600">* 파일은 브라우저 메모리에만 저장되며 새로고침 시 초기화됩니다</p>
        </div>
      </div>
    </div>
  );
}
