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

// [2026-05-01] datasource-synced 문서는 internal naming `__source:<id>/<file>`로
// 저장됨 (source-indexer.ts:sourceTag). LLM 컨텍스트에 raw로 흘러가면 AI가
// "이게 무슨 ID지?"라고 혼란 → 답변 품질 저하. source-indexer에서 import하면
// 순환 (source-indexer가 이 파일을 import 중) → inline 정의.
function stripSourceTag(name: string): string {
  return name.replace(/^__source:[^/]+\//, '');
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
// [2026-05-01 Roy] 임베딩 fetch는 90초 안에 응답 없으면 자동 abort.
// Why: 이전엔 timeout 없어 OpenAI/Google API가 stuck 시 동기화 무한 대기.
// 사용자 cancelSync도 fetch까지 전달 안 됨 → 진짜로 멈출 길이 없었음.
const EMBED_FETCH_TIMEOUT_MS = 90_000;

// [2026-05-01 Roy] AbortSignal.any/timeout는 Safari 17.4+ / Chrome 116+ — 그 이하 브라우저
// fallback. 미지원 환경에선 timeout 없이 user signal만 사용 (멈춤 위험은 있지만 throw로
// 전체 sync가 깨지진 않음).
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  return ctrl.signal;
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 0) return undefined;
  if (real.length === 1) return real[0];
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(real);
  }
  // Fallback — 어느 쪽이든 abort되면 ctrl도 abort. iOS Safari < 15.4 호환:
  // s.reason은 15.4+, 보내지 않음 (구버전에서 undefined 인자도 silent ignore이지만
  // 안전하게 abort() 인자 없이 호출).
  if (typeof AbortController === 'undefined') return real[0];
  const ctrl = new AbortController();
  for (const s of real) {
    if (s.aborted) { ctrl.abort(); break; }
    try {
      s.addEventListener('abort', () => ctrl.abort(), { once: true });
    } catch {
      // 매우 구버전 브라우저에서 { once: true } 옵션 미지원 시 폴백
      s.addEventListener('abort', () => ctrl.abort());
    }
  }
  return ctrl.signal;
}

// [2026-05-01 Roy] iOS WebKit(Safari/Chrome/Edge) "Load failed" 등 일시적 네트워크
// 에러는 retry로 대부분 자동 복구 가능. 401/403/429/abort/timeout 등 명백한 거부는
// retry 무의미 — 즉시 throw해서 사용자에게 빠르게 노출. 백오프 500ms → 1500ms.
async function fetchEmbedWithRetry(
  doFetch: () => Promise<Response>,
  parseErr: (res: Response) => Promise<string>,
  maxRetries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await doFetch();
      if (res.ok) return res;
      // 4xx 거부는 retry 무의미 (5xx만 retry 후보)
      if (res.status >= 400 && res.status < 500) {
        throw new Error(await parseErr(res));
      }
      lastErr = new Error(await parseErr(res));
    } catch (err) {
      lastErr = err;
      // AbortError/TimeoutError는 retry 무의미
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) throw err;
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (/401|403|unauthorized|forbidden|api[_ ]?key/.test(msg)) throw err;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1) + 500));
    }
  }
  throw lastErr ?? new Error('Embedding fetch failed after retries');
}

async function embedTextsOpenAI(texts: string[], apiKey: string, signal?: AbortSignal): Promise<number[][]> {
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    if (signal?.aborted) throw new DOMException('Embedding aborted', 'AbortError');
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetchEmbedWithRetry(
      () => fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: batch, model: 'text-embedding-3-small' }),
        signal: combineSignals(signal, timeoutSignal(EMBED_FETCH_TIMEOUT_MS)),
      }),
      async (r) => {
        const e = await r.json().catch(() => ({}));
        return e.error?.message || `OpenAI embedding error: ${r.status}`;
      },
    );
    const json = await res.json();
    result.push(...(json.data as { embedding: number[] }[]).map((d) => d.embedding));
  }
  return result;
}

async function embedTextsGoogle(texts: string[], apiKey: string, signal?: AbortSignal): Promise<number[][]> {
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    if (signal?.aborted) throw new DOMException('Embedding aborted', 'AbortError');
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetchEmbedWithRetry(
      () => fetch(
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
          signal: combineSignals(signal, timeoutSignal(EMBED_FETCH_TIMEOUT_MS)),
        }
      ),
      async (r) => {
        const e = await r.json().catch(() => ({}));
        return e.error?.message || `Google embedding error: ${r.status}`;
      },
    );
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
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<ParsedDocument> {
  // [2026-04-26 Tori 16384118 §3.8] cost store 통합 — 임베딩 시작 전 paused 체크
  if (typeof window !== 'undefined') {
    const { useCostStore } = await import('@/stores/d1-cost-store');
    const cost = useCostStore.getState();
    if (cost.paused) {
      throw new Error(
        cost.pauseReason === 'limit_exceeded'
          ? '일일 임베딩 한도 초과 — 자정에 자동 재개되거나 설정에서 한도 늘리기'
          : '자동 동기화 일시정지 상태'
      );
    }
  }

  const texts = doc.chunks.map((c) => c.text);
  const total = texts.length;
  const result: number[][] = [];

  const batchFn = provider === 'openai' ? embedTextsOpenAI : embedTextsGoogle;

  for (let i = 0; i < texts.length; i += 100) {
    if (signal?.aborted) throw new DOMException('Embedding aborted', 'AbortError');
    const batch = texts.slice(i, i + 100);
    const vectors = await batchFn(batch, apiKey, signal);
    result.push(...vectors);
    if (onProgress) onProgress(Math.round(((i + batch.length) / total) * 100));
  }

  // [2026-04-26 Tori 16384118 §3.8/§3.9] 비용 추정 + addCost + alert dispatch
  if (typeof window !== 'undefined') {
    try {
      const { useCostStore } = await import('@/stores/d1-cost-store');
      const { estimateInitialCost } = await import('@/lib/cost/estimate-embedding-cost');
      const totalChars = doc.chunks.reduce((s, c) => s + c.text.length, 0);
      // UTF-8 한국어 평균 3바이트/글자 가정 (영어는 1바이트). 보수적으로 4바이트로 추정.
      const totalBytes = totalChars * 4;
      const usd = estimateInitialCost(totalBytes);
      const cost = useCostStore.getState();
      const r = cost.addCost(usd);
      // $1 도달 또는 새로 paused 시 알림 dispatch
      if (r.triggeredAlert || r.nowPaused) {
        const fresh = useCostStore.getState();
        window.dispatchEvent(new CustomEvent('blend:cost-alert', {
          detail: { used: fresh.todayUsed, limit: fresh.dailyLimit, paused: fresh.paused },
        }));
      }
    } catch (e) {
      console.warn('[document-plugin] cost tracking failed:', (e as Error).message);
    }
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
        source: `${file.name} / ${sheetName} (rows ${i}–${Math.min(i + BATCH - 1, rows.length - 1)})`,
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
      source: `${file.name} (rows ${i}–${Math.min(i + BATCH - 1, lines.length - 1)})`,
    });
  }
  return chunks;
}

// [2026-04-13 00:00] BUG-008: 대용량 PDF OOM 방지 — 50페이지 제한
const PDF_MAX_PAGES = 50;

async function parsePdf(file: File): Promise<DocumentChunk[]> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use the bundled worker from node_modules
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  const chunks: DocumentChunk[] = [];

  // [2026-05-01 Roy] 암호 보호 PDF — getDocument()가 PasswordException throw.
  // 파일 전체 실패시키지 말고 warning chunk만 추가하고 빈 결과 반환 (이미지 PDF와
  // 같은 패턴). AI는 "이 파일은 암호 보호됨"으로 응답 가능.
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const name = e instanceof Error ? e.name : '';
    if (name === 'PasswordException' || /password/i.test(msg)) {
      return [{
        text: `[PASSWORD-PROTECTED PDF] The file (${file.name}) is encrypted with a password. Text cannot be extracted. To make this file searchable, remove the password protection and re-upload.`,
        source: `${file.name} (encrypted — no text)`,
      }];
    }
    throw e;
  }

  // [2026-04-13 00:00] BUG-008: 50페이지 초과 시 경고 청크 삽입 후 제한
  if (pdf.numPages > PDF_MAX_PAGES) {
    chunks.push({
      text: `[WARNING] This PDF has ${pdf.numPages} pages, exceeding the maximum of ${PDF_MAX_PAGES}. Only the first ${PDF_MAX_PAGES} pages will be analyzed. To analyze the full document, split it into smaller ranges.`,
      source: `${file.name} (warning: processing ${PDF_MAX_PAGES} of ${pdf.numPages} pages)`,
    });
  }

  // Group pages into chunks of 3 pages each for manageable context size
  const PAGE_GROUP = 3;
  // [2026-04-13 00:00] BUG-008: 처리 페이지를 PDF_MAX_PAGES로 제한
  const effectivePages = Math.min(pdf.numPages, PDF_MAX_PAGES);

  // [2026-05-01 Roy] 페이지 parse 실패 vs 진짜 텍스트 없음 구분 — 모든 페이지가
  // throw로 깨졌으면 parser/브라우저 호환 문제, 페이지는 잘 열렸는데 텍스트 0이면
  // 진짜 이미지 PDF. 이전엔 둘 다 [IMAGE-ONLY PDF]로 묶어 진단 불가능했음.
  let pagesWithText = 0;
  let pagesEmpty = 0;
  let pagesFailed = 0;
  let firstPageError: string | undefined;

  for (let start = 1; start <= effectivePages; start += PAGE_GROUP) {
    const end = Math.min(start + PAGE_GROUP - 1, effectivePages);
    const pageTexts: string[] = [];

    for (let p = start; p <= end; p++) {
      // [2026-05-01 Roy] 페이지 단위 try/catch — pdfjs-dist의 getTextContent()가
      // 특정 PDF의 특정 페이지(폰트/encoding/annotation 호환 문제)에서
      // "undefined is not a function" 류로 깨지면, 이전엔 PDF 전체 파싱 실패.
      // 이젠 그 페이지만 skip하고 나머지는 정상 인덱싱. iOS Safari + pdfjs
      // 호환성 이슈에 robust.
      let pageText = '';
      let pageOk = false;
      try {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        pageText = content.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pageOk = true;
      } catch (pageErr) {
        console.warn(`[parsePdf] page ${p} skipped (parse failed):`, pageErr);
        pagesFailed++;
        if (!firstPageError) {
          firstPageError = pageErr instanceof Error ? `${pageErr.name}: ${pageErr.message}` : String(pageErr);
        }
      }
      if (pageOk) {
        if (pageText) {
          pagesWithText++;
          pageTexts.push(`[page ${p}]\n${pageText}`);
        } else {
          pagesEmpty++;
        }
      }
    }

    if (pageTexts.length > 0) {
      chunks.push({
        text: pageTexts.join('\n\n'),
        source: `${file.name} (pages ${start}–${end})`,
      });
    }
  }

  // [2026-04-13] BUG-009 + [2026-05-01 Roy] 분기 추가:
  //   - pagesWithText === 0 && pagesFailed > 0  → parser 호환 문제 (브라우저 이슈)
  //   - pagesWithText === 0 && pagesFailed === 0 → 진짜 이미지 PDF
  //   - pagesWithText > 0 && pagesFailed > 0     → 일부 페이지만 추출됨 ([WARNING])
  const textChunks = chunks.filter((c) => !c.text.startsWith('[WARNING]'));
  if (textChunks.length === 0) {
    if (pagesFailed > 0 && pagesWithText === 0) {
      chunks.push({
        text: `[PARSE-FAILED PDF] The file (${file.name}) failed to parse on this browser — all ${pagesFailed} page(s) threw errors. First error: ${firstPageError ?? 'unknown'}. This is likely an iOS Safari + pdfjs compatibility issue, not an image PDF. Try opening on desktop or another browser.`,
        source: `${file.name} (parse failed — ${pagesFailed} pages errored)`,
      });
    } else {
      chunks.push({
        text: `[IMAGE-ONLY PDF] The file (${file.name}) is a scanned image or image-based PDF with no text layer. Text cannot be extracted; RAG search is not available. Please upload an OCR-processed or text-based document.`,
        source: `${file.name} (image PDF — no text)`,
      });
    }
  } else if (pagesFailed > 0) {
    // 일부 성공, 일부 실패 → 부분 추출 경고
    chunks.unshift({
      text: `[WARNING] ${pagesFailed} of ${effectivePages} pages failed to parse and were skipped. First error: ${firstPageError ?? 'unknown'}. Some content is missing.`,
      source: `${file.name} (partial — ${pagesFailed} pages skipped)`,
    });
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
    source: `${file.name} (chunk ${i + 1}/${parts.length})`,
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
// [2026-04-26 Tori 명세] Fast Path — 작은 텍스트 파일은 임베딩 스킵, 전체 텍스트 즉시 LLM 컨텍스트로 주입
const FAST_PATH_EXTENSIONS = ['md', 'txt', 'csv', 'json', 'log'];
const FAST_PATH_CHAR_LIMIT = 50_000; // 약 100KB 텍스트

function isFastPathDoc(doc: ParsedDocument): boolean {
  const ext = (doc.name.split('.').pop() ?? '').toLowerCase();
  if (!FAST_PATH_EXTENSIONS.includes(ext)) return false;
  return doc.totalChars > 0 && doc.totalChars <= FAST_PATH_CHAR_LIMIT;
}

export async function buildContext(
  query: string,
  docs: ParsedDocument[],
  apiKey?: string,
  provider?: 'openai' | 'google'
): Promise<string> {
  if (docs.length === 0) return '';

  // Fast path 문서를 먼저 추출하여 우선 컨텍스트로 주입
  const fastPathDocs = docs.filter(isFastPathDoc);
  const remainingDocs = docs.filter((d) => !isFastPathDoc(d));

  let fastPathBlock = '';
  if (fastPathDocs.length > 0) {
    const lines = fastPathDocs.map((d) => {
      const fullText = d.chunks.map((c) => c.text).join('\n').slice(0, FAST_PATH_CHAR_LIMIT);
      return `[source: ${stripSourceTag(d.name)}]\n${fullText}`;
    });
    fastPathBlock =
      `[Fast-path documents — full text injected without embedding search]\n` +
      `These small text files are included in full so the assistant can reference exact content.\n\n` +
      lines.join('\n\n---\n\n');
  }

  if (remainingDocs.length === 0) {
    return fastPathBlock;
  }

  // [2026-04-13] BUG-009: 청크 없는 문서(이미지 PDF 등) 방어 처리 — d.chunks.length > 0 추가
  const embeddedDocs = remainingDocs.filter((d) => d.embeddingModel && d.chunks.length > 0 && d.chunks.some((c) => c.embedding));
  const plainDocs = remainingDocs.filter((d) => !d.embeddingModel && d.chunks.length > 0);

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
  // [2026-04-28] BUG-007 fix: 영어 트리거 누락 + 청크 수 부족 (4 → 12)
  //   - 영어 사용자 "summarize / explain / what is" 입력 시 매칭 안 되어
  //     docContext가 빈 문자열로 가서 AI가 "Not found" 응답.
  //   - 4 청크만 주면 큰 PDF의 일부만 보이므로 AI가 요약 못 함 → 12로 증가.
  if (relevant.length === 0) {
    const ql = query.toLowerCase();
    const summaryTriggersKo = ['내용', '요약', '뭔데', '뭐야', '뭐가', '전체', '알려줘', '설명', '어떤', '있어', '첨부', '파일'];
    const summaryTriggersEn = [
      'summar', 'overview', 'tell me', 'what is', 'what\'s', 'whats',
      'describe', 'explain', 'about', 'content', 'attach', 'this file',
      'this pdf', 'this document', 'tldr', 'tl;dr',
    ];
    const isSummaryRequest =
      summaryTriggersKo.some((k) => query.includes(k)) ||
      summaryTriggersEn.some((k) => ql.includes(k)) ||
      extractKeywords(query).length === 0;
    if (isSummaryRequest) {
      const allChunks = docs.flatMap((d) => d.chunks);
      relevant = allChunks.slice(0, 12);
    }
  }

  // ── No results — 빈 문자열 반환 (일반 지식으로 답변 허용) ──────────────────
  // [2026-04-13] BUG-011: 문서와 무관한 일반 질문도 "문서에 없습니다"로 차단되는 문제
  // 이전: 검색 결과 없을 때 "반드시 문서에서만 답변하라"는 강제 명령 주입
  //   → 버스 노선, 날씨, 수학 등 문서와 무관한 모든 질문까지 차단됨
  // 수정: 검색 결과가 없으면 빈 문자열 반환 → AI가 일반 지식으로 자유롭게 답변
  //   → 문서에서 관련 내용을 찾은 경우에만 "이 문서 기반으로 답변" 제약 적용
  if (relevant.length === 0) {
    return '';
  }

  // ── Build context block ───────────────────────────────────────────────────
  const method = usedSemantic ? 'hybrid search (vector 0.7 + BM25 0.3)' : 'keyword search';
  const lines = relevant.map((c) => `[source: ${stripSourceTag(c.source)}]\n${c.text}`).join('\n\n---\n\n');
  return (
    `[Document search results: ${relevant.length} chunks (${method})]\n` +
    `Answer based only on the content below. Do not speculate or answer with information not found in the document.\n\n` +
    lines
  );
}

// ── Extraction Status (Tori 17989643 PR #4) ────────────────────────────────
// PDF/문서가 정상 텍스트 추출됐는지, 이미지 PDF인지, 일부만 추출됐는지 판정.
// 활성 칩 status-dot 색상 (노랑/빨강) 결정에 사용.

export type ExtractionStatus =
  | 'ok'           // 정상 추출
  | 'partial'      // 일부만 추출 (페이지 제한 초과 / 일부 페이지 빈 텍스트)
  | 'image_only'   // 텍스트 레이어 0 (이미지 PDF)
  | 'empty';       // 청크 자체가 0 (파싱 실패)

export function getExtractionStatus(doc: ParsedDocument): ExtractionStatus {
  if (!doc.chunks || doc.chunks.length === 0) return 'empty';

  const hasImageOnlyChunk = doc.chunks.some((c) =>
    c.text.startsWith('[IMAGE-ONLY PDF]')
  );
  if (hasImageOnlyChunk && doc.chunks.length === 1) return 'image_only';

  const hasWarningChunk = doc.chunks.some((c) =>
    c.text.startsWith('[WARNING]')
  );
  // [WARNING] 청크가 있으면 페이지 제한 초과 (일부만 처리됨) → partial
  if (hasWarningChunk) return 'partial';

  // 추출된 텍스트가 너무 적으면 (예: 100자 미만) partial로 간주
  if (doc.totalChars > 0 && doc.totalChars < 100) return 'partial';

  return 'ok';
}

// ── Full Context Mode (Tori 17989643 PR #1) ────────────────────────────────
// 번역/요약/재구성 같은 전체 처리 의도용. RAG 검색 우회하고 파일 전체 텍스트
// 를 LLM 컨텍스트로 주입. 토큰 한도 초과 시 호출자가 chunked 처리 결정.
//
// FULL_CONTEXT_TOKENS_INLINE (50K), FULL_CONTEXT_TOKENS_CHUNKED (200K) 임계값
// 은 intent-classifier.ts 참조.

const FULL_CONTEXT_INLINE_CHAR_LIMIT  = 150_000;  // ~50K tokens
const FULL_CONTEXT_CHUNKED_CHAR_LIMIT = 600_000;  // ~200K tokens

export interface FullContextResult {
  /** 'inline' = 그대로, 'chunked' = 호출자가 분할, 'too_large' = 거부 */
  strategy: 'inline' | 'chunked' | 'too_large';
  /** strategy='inline' 일 때만 채워짐. system 메시지로 prepend. */
  context: string;
  /** strategy='chunked' 일 때 호출자가 사용. 각 chunk 별 별도 LLM 요청. */
  chunks: Array<{ source: string; text: string; index: number; total: number }>;
  /** 총 글자 수 (디버깅/로깅용) */
  totalChars: number;
}

export function buildFullContext(docs: ParsedDocument[]): FullContextResult {
  if (docs.length === 0) {
    return { strategy: 'inline', context: '', chunks: [], totalChars: 0 };
  }

  const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);

  if (totalChars <= FULL_CONTEXT_INLINE_CHAR_LIMIT) {
    const blocks = docs.map((d) => {
      const fullText = d.chunks.map((c) => c.text).join('\n');
      return `[source: ${stripSourceTag(d.name)}]\n${fullText}`;
    });
    const context =
      `[Active sources — full text inlined for whole-file processing]\n` +
      `These ${docs.length} file(s) are provided in full so you can translate/summarize/restructure as requested.\n\n` +
      blocks.join('\n\n---\n\n');
    return { strategy: 'inline', context, chunks: [], totalChars };
  }

  if (totalChars <= FULL_CONTEXT_CHUNKED_CHAR_LIMIT) {
    // 청크 단위 순차 처리 — 호출자가 chunks를 N번 LLM 호출로 처리
    const flat: Array<{ source: string; text: string }> = [];
    for (const d of docs) {
      for (const c of d.chunks) {
        flat.push({ source: stripSourceTag(d.name), text: c.text });
      }
    }
    return {
      strategy: 'chunked',
      context: '',
      chunks: flat.map((c, i) => ({ ...c, index: i, total: flat.length })),
      totalChars,
    };
  }

  return { strategy: 'too_large', context: '', chunks: [], totalChars };
}

// ── Metadata-only Mode (Tori 17989643 PR #1) ───────────────────────────────
// "몇 페이지", "파일 크기" 같은 메타 질문용. 본문 없이 메타데이터만 주입.

export function buildMetadataContext(docs: ParsedDocument[]): string {
  if (docs.length === 0) return '';
  const lines = docs.map((d) => {
    const charCount = d.totalChars;
    const chunkCount = d.chunks.length;
    return `- ${stripSourceTag(d.name)}
  type: ${d.type}
  total characters: ${charCount.toLocaleString()}
  chunks: ${chunkCount}
  embedded: ${d.embeddingModel ?? 'no'}`;
  });
  return (
    `[Active sources — metadata]\n` +
    `These are the file names and metadata of all currently active documents. ` +
    `When the user asks "what files are there" or similar listing questions, ` +
    `answer with this list directly. Body content is not loaded in this mode.\n\n` +
    lines.join('\n')
  );
}
