// Blend - Document Plugin (RAG: keyword search over uploaded files)
// Supports: .xlsx, .xls, .csv, .txt, .md

export interface DocumentChunk {
  text: string;
  source: string; // filename + sheet/row info
}

export interface ParsedDocument {
  id: string;
  name: string;
  type: string;
  chunks: DocumentChunk[];
  totalChars: number;
}

/** Parse a file and split into searchable chunks */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let chunks: DocumentChunk[] = [];

  if (ext === 'xlsx' || ext === 'xls') {
    chunks = await parseExcel(file);
  } else if (ext === 'csv') {
    chunks = await parseCsv(file);
  } else {
    // txt, md, or any text file
    chunks = await parsePlainText(file);
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  return { id, name: file.name, type: ext, chunks, totalChars };
}

async function parseExcel(file: File): Promise<DocumentChunk[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const chunks: DocumentChunk[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length === 0) continue;

    // First row as header
    const headers = rows[0].map(String);
    const BATCH = 20; // rows per chunk

    for (let i = 1; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const lines = batch.map((row) =>
        headers.map((h, j) => `${h}: ${row[j] ?? ''}`).join(' | ')
      );
      chunks.push({
        text: lines.join('\n'),
        source: `${file.name} / ${sheetName} (행 ${i}–${Math.min(i + BATCH - 1, rows.length - 1)})`,
      });
    }
  }

  return chunks;
}

async function parseCsv(file: File): Promise<DocumentChunk[]> {
  const text = await file.text();
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const BATCH = 30;
  const chunks: DocumentChunk[] = [];

  for (let i = 1; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH);
    const rows = batch.map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      return headers.map((h, j) => `${h}: ${vals[j] ?? ''}`).join(' | ');
    });
    chunks.push({
      text: rows.join('\n'),
      source: `${file.name} (행 ${i}–${Math.min(i + BATCH - 1, lines.length - 1)})`,
    });
  }

  return chunks;
}

async function parsePlainText(file: File): Promise<DocumentChunk[]> {
  const text = await file.text();
  const CHUNK_SIZE = 1500;
  const OVERLAP = 150;
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
    const slice = text.slice(i, i + CHUNK_SIZE);
    if (slice.trim()) {
      chunks.push({ text: slice, source: `${file.name} (문자 ${i}–${i + slice.length})` });
    }
    if (i + CHUNK_SIZE >= text.length) break;
  }

  return chunks;
}

/**
 * Search chunks for keywords from the query and return top-k relevant chunks.
 * Simple TF-IDF-like scoring: counts keyword hits per chunk.
 */
export function searchChunks(query: string, chunks: DocumentChunk[], topK = 5): DocumentChunk[] {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (keywords.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map((chunk) => {
    const lower = chunk.text.toLowerCase();
    const score = keywords.reduce((sum, kw) => {
      let count = 0;
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) { count++; pos++; }
      return sum + count;
    }, 0);
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

/** Build a context block to inject into the system prompt */
export function buildContext(query: string, docs: ParsedDocument[]): string {
  if (docs.length === 0) return '';

  const allChunks = docs.flatMap((d) => d.chunks);
  const relevant = searchChunks(query, allChunks, 6);

  if (relevant.length === 0) return '';

  const lines = relevant.map((c) => `[${c.source}]\n${c.text}`).join('\n\n---\n\n');
  return `아래는 업로드된 문서에서 검색된 관련 내용입니다. 이를 참고하여 답변하세요:\n\n${lines}`;
}
