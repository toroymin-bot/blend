// Blend - Document Plugin (RAG: semantic + keyword search over uploaded files)
// Supports: .xlsx, .xls, .csv, .txt, .md

export interface DocumentChunk {
  text: string;
  source: string;
  embedding?: number[]; // vector from embedding model
}

export interface ParsedDocument {
  id: string;
  name: string;
  type: string;
  chunks: DocumentChunk[];
  totalChars: number;
  embeddingModel?: 'openai' | 'google'; // set after generateEmbeddings()
}

// ── Stopwords (Korean + English) ──────────────────────────────────────────────

const STOPWORDS = new Set([
  // Korean particles / function words
  '이', '가', '은', '는', '을', '를', '의', '에', '서', '로', '와', '과',
  '도', '만', '에서', '으로', '이다', '있다', '하다', '이고', '그리고',
  '하지만', '그래서', '어떻게', '무엇', '어떤', '얼마나', '어디', '언제',
  '왜', '누가', '입니다', '습니다', '합니다', '됩니다', '있습니다', '없습니다',
  '이런', '저런', '그런', '같은', '위한', '대한', '통해', '따라',
  // English stopwords (length ≤ 2 also caught by the >2 filter below)
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'did', 'let', 'put', 'say', 'she', 'too', 'use', 'been', 'from', 'have',
  'here', 'just', 'know', 'like', 'look', 'make', 'more', 'most', 'over',
  'said', 'some', 'than', 'that', 'them', 'then', 'they', 'this', 'time',
  'very', 'what', 'when', 'will', 'with', 'your', 'also', 'back', 'come',
  'each', 'even', 'into', 'only', 'such', 'take', 'than', 'well', 'were',
  'about', 'after', 'again', 'being', 'could', 'does', 'down', 'each',
  'first', 'from', 'have', 'into', 'made', 'many', 'much', 'must', 'need',
  'other', 'same', 'should', 'since', 'still', 'their', 'there', 'these',
  'those', 'through', 'under', 'until', 'using', 'where', 'which', 'while',
  'would', 'write',
]);

/** Extract meaningful keywords from query — strips stopwords and short words */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,\.!?:;()\[\]{}'"]+/)
    .map((w) => w.replace(/[^\w가-힣]/g, ''))
    // [2026-04-10] 한국어 2글자 단어("문서","내용","회의" 등) 필터링 버그 수정
    // 기존: w.length > 2 → 한국어 2글자 단어 전부 제거되어 RAG 검색 실패
    // 수정: 한국어는 2글자부터, 영어는 3글자부터 허용
    // .filter((w) => w.length > 2 && !STOPWORDS.has(w))  // 구버전
    .filter((w) => (w.match(/[가-힣]/) ? w.length >= 2 : w.length > 2) && !STOPWORDS.has(w));
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Embedding API calls ───────────────────────────────────────────────────────

const EMBED_BATCH = 100; // max inputs per API call

async function embedTextsOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: batch, model: 'text-embedding-3-small' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI embedding error: ${res.status}`);
    }
    const json = await res.json();
    result.push(...(json.data as { embedding: number[] }[]).map((d) => d.embedding));
  }
  return result;
}

async function embedTextsGoogle(texts: string[], apiKey: string): Promise<number[][]> {
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          })),
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Google embedding error: ${res.status}`);
    }
    const json = await res.json();
    result.push(...(json.embeddings as { values: number[] }[]).map((e) => e.values));
  }
  return result;
}

/** Embed all chunks of a document. Returns a new ParsedDocument with embeddings filled in. */
export async function generateEmbeddings(
  doc: ParsedDocument,
  apiKey: string,
  provider: 'openai' | 'google',
  onProgress?: (percent: number) => void
): Promise<ParsedDocument> {
  const texts = doc.chunks.map((c) => c.text);
  const total = texts.length;
  const result: number[][] = [];

  const batchFn = provider === 'openai' ? embedTextsOpenAI : embedTextsGoogle;

  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const vectors = await batchFn(batch, apiKey);
    result.push(...vectors);
    if (onProgress) onProgress(Math.round(((i + batch.length) / total) * 100));
  }

  return {
    ...doc,
    embeddingModel: provider,
    chunks: doc.chunks.map((chunk, i) => ({ ...chunk, embedding: result[i] })),
  };
}

// ── File parsing ──────────────────────────────────────────────────────────────

/** Parse a file and split into searchable chunks */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let chunks: DocumentChunk[] = [];

  if (ext === 'xlsx' || ext === 'xls') {
    chunks = await parseExcel(file);
  } else if (ext === 'csv') {
    chunks = await parseCsv(file);
  } else if (ext === 'pdf') {
    chunks = await parsePdf(file);
  } else {
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

    const headers = rows[0].map(String);
    const BATCH = 20;

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

async function parsePdf(file: File): Promise<DocumentChunk[]> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use the bundled worker from node_modules
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const chunks: DocumentChunk[] = [];

  // Group pages into chunks of 3 pages each for manageable context size
  const PAGE_GROUP = 3;

  for (let start = 1; start <= pdf.numPages; start += PAGE_GROUP) {
    const end = Math.min(start + PAGE_GROUP - 1, pdf.numPages);
    const pageTexts: string[] = [];

    for (let p = start; p <= end; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => item.str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) pageTexts.push(`[${p}페이지]\n${pageText}`);
    }

    if (pageTexts.length > 0) {
      chunks.push({
        text: pageTexts.join('\n\n'),
        source: `${file.name} (${start}–${end}페이지)`,
      });
    }
  }

  return chunks;
}

// [2026-04-12 01:07] 기존 글자 수 기반 청킹 비활성화 (5-2단계 개선)
// function splitByCharCount(text: string, chunkSize: number, overlap: number): string[] {
//   const chunks: string[] = [];
//   for (let i = 0; i < text.length; i += chunkSize - overlap) {
//     chunks.push(text.slice(i, i + chunkSize));
//     if (i + chunkSize >= text.length) break;
//   }
//   return chunks;
// }

// ── 5-2단계: 문단/문장 경계 기반 청킹 ─────────────────────────────────────────

/**
 * 문단(\\n\\n) → 문장(.!?。\\n) 경계에서만 청크를 자름.
 * 최대 청크 크기를 유지하되 자연스러운 경계에서 분리.
 * 한국어 문장 종결 패턴 포함.
 */
function splitByBoundary(text: string, maxChunkSize = 1500, overlap = 150): string[] {
  // 1) 문단 분리
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 2 <= maxChunkSize) {
      buffer = buffer ? buffer + '\n\n' + para : para;
    } else {
      // buffer가 찼거나, 단일 문단이 maxChunkSize 초과
      if (buffer) {
        chunks.push(buffer.trim());
        // 오버랩: 이전 청크의 마지막 overlap 글자를 다음 청크 시작으로
        const tail = buffer.slice(-overlap).trim();
        buffer = tail ? tail + '\n\n' + para : para;
      } else {
        // 단일 문단이 maxChunkSize 초과 → 문장 단위로 분리
        const sentences = splitBySentence(para, maxChunkSize, overlap);
        chunks.push(...sentences.slice(0, -1));
        buffer = sentences[sentences.length - 1] ?? '';
      }
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

/**
 * 문장 경계에서 분리 (문단 하나가 maxChunkSize를 초과할 때 사용).
 * 종결 기준: '. ', '! ', '? ', '。', '\n', '다. ', '요. ', '죠. '
 */
function splitBySentence(text: string, maxChunkSize: number, overlap: number): string[] {
  // 문장 종결 패턴 (한국어 포함)
  const sentenceEnd = /(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=요\.)\s+|(?<=죠\.)\s+|\n/g;
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = sentenceEnd.exec(text)) !== null) {
    parts.push(text.slice(last, m.index + m[0].length));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  const chunks: string[] = [];
  let buffer = '';
  for (const part of parts) {
    if (buffer.length + part.length <= maxChunkSize) {
      buffer += part;
    } else {
      if (buffer.trim()) chunks.push(buffer.trim());
      const tail = buffer.slice(-overlap);
      buffer = tail + part;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

async function parsePlainText(file: File): Promise<DocumentChunk[]> {
  const text = await file.text();
  // [2026-04-12 01:07] 5-2단계: 글자 수 기반 → 문단/문장 경계 기반 청킹
  const parts = splitByBoundary(text, 1500, 150);
  return parts.map((slice, i) => ({
    text: slice,
    source: `${file.name} (청크 ${i + 1}/${parts.length})`,
  }));
}

// ── Search ────────────────────────────────────────────────────────────────────

/** Semantic search: cosine similarity with a 0.35 threshold */
function searchSemantic(
  queryVec: number[],
  chunks: DocumentChunk[],
  topK: number
): DocumentChunk[] {
  return chunks
    .filter((c) => c.embedding)
    .map((c) => ({ chunk: c, score: cosineSimilarity(queryVec, c.embedding!) }))
    .filter((s) => s.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

/** Keyword search fallback: TF-style scoring with stopword removal and proportional threshold */
function searchKeyword(
  query: string,
  chunks: DocumentChunk[],
  topK: number
): DocumentChunk[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  // Proportional min score: 1 for short queries, higher for longer ones
  const minScore = Math.max(1, Math.floor(keywords.length * 0.4));

  return chunks
    .map((chunk) => {
      const lower = chunk.text.toLowerCase();
      const score = keywords.reduce((sum, kw) => {
        let count = 0;
        let pos = 0;
        while ((pos = lower.indexOf(kw, pos)) !== -1) { count++; pos++; }
        return sum + count;
      }, 0);
      return { chunk, score };
    })
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ── 5-3단계: BM25 키워드 점수 계산 ───────────────────────────────────────────

// 하이브리드 가중치 상수
const HYBRID_VECTOR_WEIGHT = 0.7;
const HYBRID_KEYWORD_WEIGHT = 0.3;

// BM25 파라미터
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** BM25 키워드 점수 계산 (0~1 정규화 포함) */
function computeBM25Scores(query: string, chunks: DocumentChunk[]): Map<DocumentChunk, number> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return new Map();

  const avgDocLen = chunks.reduce((s, c) => s + c.text.length, 0) / Math.max(chunks.length, 1);
  const N = chunks.length;

  // IDF 계산: log((N - df + 0.5) / (df + 0.5) + 1)
  const df = new Map<string, number>();
  for (const kw of keywords) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.text.toLowerCase().includes(kw)) count++;
    }
    df.set(kw, count);
  }

  const rawScores = new Map<DocumentChunk, number>();
  let maxScore = 0;

  for (const chunk of chunks) {
    const lower = chunk.text.toLowerCase();
    const docLen = chunk.text.length;
    let score = 0;

    for (const kw of keywords) {
      // TF 계산
      let tf = 0;
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) { tf++; pos++; }
      if (tf === 0) continue;

      // IDF
      const dfVal = df.get(kw) ?? 0;
      const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1);

      // BM25 TF 정규화
      const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgDocLen)));
      score += idf * tfNorm;
    }

    rawScores.set(chunk, score);
    if (score > maxScore) maxScore = score;
  }

  // 0~1 정규화
  const normalized = new Map<DocumentChunk, number>();
  for (const [chunk, score] of rawScores) {
    normalized.set(chunk, maxScore > 0 ? score / maxScore : 0);
  }
  return normalized;
}

/** 하이브리드 검색: 벡터 0.7 + BM25 0.3 가중치로 재정렬 */
function searchHybrid(
  queryVec: number[],
  query: string,
  chunks: DocumentChunk[],
  topK: number
): DocumentChunk[] {
  const embeddedChunks = chunks.filter((c) => c.embedding);
  if (embeddedChunks.length === 0) return searchKeyword(query, chunks, topK);

  // 벡터 점수 (0~1)
  const vectorScores = new Map<DocumentChunk, number>();
  for (const chunk of embeddedChunks) {
    vectorScores.set(chunk, cosineSimilarity(queryVec, chunk.embedding!));
  }

  // BM25 점수 (0~1)
  const bm25Scores = computeBM25Scores(query, embeddedChunks);

  // 하이브리드 점수 = 벡터 * 0.7 + BM25 * 0.3
  return embeddedChunks
    .map((chunk) => {
      const vScore = vectorScores.get(chunk) ?? 0;
      const kScore = bm25Scores.get(chunk) ?? 0;
      const hybridScore = HYBRID_VECTOR_WEIGHT * vScore + HYBRID_KEYWORD_WEIGHT * kScore;
      return { chunk, hybridScore };
    })
    .filter((s) => s.hybridScore > 0.1) // 최소 관련도 임계값
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the RAG context string to inject into the system prompt.
 * - Uses semantic search if chunks have embeddings + API key is available.
 * - Falls back to improved keyword search otherwise.
 * - Injects an explicit "없음" instruction when nothing is found — prevents hallucination.
 */
export async function buildContext(
  query: string,
  docs: ParsedDocument[],
  apiKey?: string,
  provider?: 'openai' | 'google'
): Promise<string> {
  if (docs.length === 0) return '';

  const embeddedDocs = docs.filter((d) => d.embeddingModel && d.chunks.some((c) => c.embedding));
  const plainDocs = docs.filter((d) => !d.embeddingModel);

  let relevant: DocumentChunk[] = [];
  let usedSemantic = false;

  // ── Semantic + BM25 하이브리드 검색 경로 (5-3단계) ──────────────────────────
  if (embeddedDocs.length > 0 && apiKey && provider) {
    try {
      // Embed the query using the same model that was used for the chunks
      const embeddingProvider = embeddedDocs[0].embeddingModel!;
      const [queryVec] =
        embeddingProvider === 'openai'
          ? await embedTextsOpenAI([query], apiKey)
          : await embedTextsGoogle([query], apiKey);

      const embeddedChunks = embeddedDocs.flatMap((d) => d.chunks);
      // [2026-04-12 01:07] 5-3단계: 순수 벡터 검색 → 하이브리드 검색 (BM25 0.3 가중치 추가)
      // 기존: relevant = searchSemantic(queryVec, embeddedChunks, 6);
      relevant = searchHybrid(queryVec, query, embeddedChunks, 6);
      usedSemantic = true;

      // If there are docs without embeddings, also run keyword search on them
      if (plainDocs.length > 0) {
        const keywordResults = searchKeyword(query, plainDocs.flatMap((d) => d.chunks), 3);
        relevant.push(...keywordResults);
      }
    } catch {
      // API call failed — fall through to keyword search
      relevant = searchKeyword(query, docs.flatMap((d) => d.chunks), 6);
    }
  } else {
    // ── Keyword search path ───────────────────────────────────────────────
    relevant = searchKeyword(query, docs.flatMap((d) => d.chunks), 6);
  }

  // [2026-04-10] 검색 결과 0개일 때 요약 요청 감지 → 첫 청크 반환
  // 기존: 바로 "찾을 수 없습니다" 반환 → "문서 내용이 뭔데" 같은 질문에도 실패
  // 수정: "내용/요약/뭔데/전체" 등 요약 요청이면 첫 4개 청크를 반환
  if (relevant.length === 0) {
    const summaryTriggers = ['내용', '요약', '뭔데', '뭐야', '뭐가', '전체', '알려줘', '설명', '어떤', '있어'];
    const isSummaryRequest = summaryTriggers.some((k) => query.includes(k)) || extractKeywords(query).length === 0;
    if (isSummaryRequest) {
      const allChunks = docs.flatMap((d) => d.chunks);
      relevant = allChunks.slice(0, 4);
    }
  }

  // ── No results — inject explicit "not found" instruction ─────────────────
  // This is the most important hallucination prevention measure:
  // without it, the LLM uses its training data to fill in the gap.
  if (relevant.length === 0) {
    const method = usedSemantic ? '하이브리드 검색 (벡터 0.7 + BM25 0.3)' : '키워드 검색';
    return (
      `[문서 검색 결과: 없음 (${method})]\n` +
      `업로드된 문서에서 이 질문과 관련된 내용을 찾을 수 없습니다.\n` +
      `반드시 "업로드된 문서에서 관련 내용을 찾을 수 없습니다"라고만 답변하세요. ` +
      `문서에 없는 내용을 추측하거나 일반 지식으로 보완하지 마세요.`
    );
  }

  // ── Build context block ───────────────────────────────────────────────────
  const method = usedSemantic ? '하이브리드 검색 (벡터 0.7 + BM25 0.3)' : '키워드 검색';
  const lines = relevant.map((c) => `[출처: ${c.source}]\n${c.text}`).join('\n\n---\n\n');
  return (
    `[문서 검색 결과: ${relevant.length}개 청크 (${method})]\n` +
    `아래 내용만을 근거로 답변하세요. 문서에 없는 내용은 추측하거나 답변하지 마세요.\n\n` +
    lines
  );
}
