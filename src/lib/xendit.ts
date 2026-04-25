// [2026-04-18] Xendit payment integration (Philippines / SE Asia)
// Supports: GCash, Maya, Touch 'n Go, GrabPay, FPX, credit/debit card
//
// Xendit invoice creation requires a server-side secret key (XENDIT_SECRET_KEY).
// Until a backend is available, use the openXenditInvoice() function which
// calls a Vercel Edge Function endpoint at /api/xendit-invoice.
//
// Requires env vars:
//   NEXT_PUBLIC_XENDIT_PUBLIC_KEY=xnd_public_xxxx  (client-side, payment widget)
//   XENDIT_SECRET_KEY=xnd_xxxx                     (server-side only — never expose to client)

export interface XenditInvoiceOptions {
  amount: number;
  currency?: 'PHP' | 'MYR' | 'IDR';
  description: string;
  payerEmail?: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
}

export interface XenditInvoiceResult {
  id: string;
  invoice_url: string;
}

export async function openXenditInvoice(opts: XenditInvoiceOptions): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const langSeg = typeof window !== 'undefined'
    ? (window.location.pathname.match(/^\/(ko|en)(\/|$)/)?.[1] ?? 'ko')
    : 'ko';

  const res = await fetch('/api/xendit-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: opts.amount,
      currency: opts.currency ?? 'PHP',
      description: opts.description,
      payer_email: opts.payerEmail,
      success_redirect_url: opts.successRedirectUrl ?? `${origin}/${langSeg}/payment/success`,
      failure_redirect_url: opts.failureRedirectUrl ?? `${origin}/${langSeg}/payment/fail`,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Xendit error: ${res.status}`);
  }

  const { invoice_url } = (await res.json()) as XenditInvoiceResult;
  window.open(invoice_url, '_blank');
}

export function isXenditConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_XENDIT_PUBLIC_KEY;
}
