/**
 * Browser storage usage / quota — 동적 측정.
 *
 * navigator.storage.estimate() 기반. 정적 "10MB 가정" 대신 브라우저가 실제로
 * 허용하는 한도(localStorage + IndexedDB + Cache 등 origin 전체)를 비동기 조회.
 *
 * - quota: 브라우저 origin이 사용할 수 있는 최대 바이트 (보통 디스크의 일부 %)
 * - usage: 현재 사용 중인 바이트 (모든 storage type 합산 추정)
 * - percent: usage / quota * 100, 0~100
 *
 * 미지원 브라우저(구 Safari 등)는 nullable 반환 → caller가 fallback 메시지 표시.
 */

export interface StorageEstimateResult {
  usage: number;
  quota: number;
  percent: number;
  /** 사람이 읽기 쉬운 단위 (예: "1.2 MB / 9.7 GB · 0.01%"). */
  pretty: string;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = (navigator as Navigator & { storage?: { estimate?: () => Promise<StorageEstimate> } }).storage;
  if (!storage?.estimate) return null;
  try {
    const est = await storage.estimate();
    const usage = est.usage ?? 0;
    const quota = est.quota ?? 0;
    const percent = quota > 0 ? (usage / quota) * 100 : 0;
    const pretty = quota > 0
      ? `${fmtBytes(usage)} / ${fmtBytes(quota)} · ${percent.toFixed(2)}%`
      : `${fmtBytes(usage)} 사용 중`;
    return { usage, quota, percent, pretty };
  } catch {
    return null;
  }
}
