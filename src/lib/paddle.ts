// [2026-04-17] Paddle Billing v2 — client-side checkout utility
// Supports Korea + global (200+ countries). No backend required (static export compatible).
// Paddle acts as Merchant of Record → VAT / tax / refunds handled automatically.

declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: { token: string }) => void;
      Checkout: {
        open: (options: {
          items: { priceId: string; quantity: number }[];
          settings?: {
            displayMode?: 'overlay' | 'inline';
            theme?: 'dark' | 'light';
          };
        }) => void;
      };
      Environment: { set: (env: 'sandbox' | 'production') => void };
    };
  }
}

let paddleInitialized = false;

/**
 * Initialize Paddle with the client-side token from env vars.
 * Safe to call multiple times — initializes once only.
 */
export function initPaddle(): boolean {
  if (typeof window === 'undefined' || !window.Paddle) return false;
  if (paddleInitialized) return true;

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) {
    console.warn('[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN not set');
    return false;
  }

  if (process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox') {
    window.Paddle.Environment.set('sandbox');
  }

  window.Paddle.Initialize({ token });
  paddleInitialized = true;
  return true;
}

/**
 * Open Paddle overlay checkout for a given Price ID.
 * Call initPaddle() first.
 */
export function openPaddleCheckout(priceId: string): void {
  if (!window.Paddle) {
    console.warn('[Paddle] Paddle.js not loaded yet');
    return;
  }
  window.Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    settings: { displayMode: 'overlay', theme: 'dark' },
  });
}

/**
 * Initialize + open checkout in one call.
 * Returns false if Paddle is not configured.
 */
export function startPaddleCheckout(priceId: string): boolean {
  const ready = initPaddle();
  if (!ready || !priceId) return false;
  openPaddleCheckout(priceId);
  return true;
}
