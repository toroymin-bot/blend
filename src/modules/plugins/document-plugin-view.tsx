'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, ToggleLeft, ToggleRight, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { useDocumentStore } from '@/stores/document-store';
import { parseDocument } from '@/modules/plugins/document-plugin';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function DocumentPluginView() {
  const { documents, activeDocIds, addDocument, removeDocument, toggleActive } = useDocumentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['xlsx', 'xls', 'csv', 'txt', 'md'].includes(ext ?? '')) {
          setError(`지원하지 않는 파일 형식: ${file.name} (xlsx, xls, csv, txt, md만 가능)`);
          continue;
        }
        const doc = await parseDocument(file);
        addDocument(doc);
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
          <p className="text-gray-500 text-xs mt-1">.xlsx · .xls · .csv · .txt · .md</p>
          {loading && <p className="text-blue-400 text-xs mt-2 animate-pulse">파싱 중...</p>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.md"
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
                      <p className="text-xs text-gray-500">
                        {doc.chunks.length}개 청크 · {formatBytes(doc.totalChars)}
                      </p>
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
          <p className="font-medium text-gray-400 mb-2">사용 방법</p>
          <p>1. 파일 업로드 후 문서를 활성화합니다</p>
          <p>2. 채팅창에서 평소처럼 질문합니다</p>
          <p>3. AI가 문서 내용을 참고하여 답변합니다</p>
          <p className="text-gray-600 mt-2">* 파일은 브라우저 메모리에만 저장되며 새로고침 시 초기화됩니다</p>
        </div>
      </div>
    </div>
  );
}
