/**
 * Safe localStorage helpers — wraps setItem with try/catch and emits
 * a `blend:storage-quota-exceeded` window event on QuotaExceededError so
 * higher-level UI can show a toast / prompt the user to free up space.
 *
 * Background: BUG-005 — many stores called `localStorage.setItem` bare,
 * which silently dropped writes (or surfaced as uncaught exceptions) once
 * the per-origin quota was hit. Centralising the wrapper keeps every
 * write opt-in to the same telemetry + error-handling path.
 */

export type StorageQuotaDetail = {
  store: string;
  key: string;
  approxBytes: number;
};

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  // Edge / older WebKit: quota error has code 22 / 1014
  const code = (err as { code?: number }).code;
  return code === 22 || code === 1014;
}

function dispatchQuotaEvent(detail: StorageQuotaDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('blend:storage-quota-exceeded', { detail }));
  } catch {
    // ignore — last-resort path, never throw
  }
}

/**
 * Try to write `value` to `localStorage[key]`. Returns true on success.
 * On QuotaExceededError it logs a warning, dispatches the global event,
 * and returns false so callers can branch (e.g. trim and retry).
 */
export function safeSetItem(key: string, value: string, store = 'unknown'): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      console.warn(`[safe-storage] quota exceeded writing "${key}" (store=${store}, ~${value.length}B)`);
      dispatchQuotaEvent({ store, key, approxBytes: value.length });
    } else {
      console.error(`[safe-storage] setItem failed for "${key}" (store=${store})`, err);
    }
    return false;
  }
}

/**
 * Like safeSetItem but trims the payload via `trim()` and retries once
 * if the first write hits the quota. Returns the bytes purged on retry,
 * or 0 on first-try success / hard failure.
 */
export function safeSetItemWithTrim<T>(
  key: string,
  value: T,
  serialize: (v: T) => string,
  trim: (v: T) => T,
  store = 'unknown',
): number {
  const initial = serialize(value);
  if (safeSetItem(key, initial, store)) return 0;
  const trimmed = trim(value);
  const retry = serialize(trimmed);
  safeSetItem(key, retry, store);
  return Math.max(0, initial.length - retry.length);
}
