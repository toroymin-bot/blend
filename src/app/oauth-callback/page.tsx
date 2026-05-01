'use client';

// OAuth callback page — handles both Google (implicit/hash) and OneDrive (PKCE/code)
//
// Google OAuth: access_token in URL hash fragment
// OneDrive OAuth: authorization_code in URL query string (PKCE flow)
//
// Three delivery methods for the token:
//  1. window.opener.postMessage — works on desktop browsers
//  2. BroadcastChannel         — works on iOS Safari / Firefox (opener is null)
//  3. localStorage             — ultimate fallback (polled by the connector)

import { useEffect, useState } from 'react';

export default function OAuthCallback() {
  const [status, setStatus] = useState('Authenticating...');

  useEffect(() => {
    async function handleCallback() {
      const hash = window.location.hash.slice(1); // remove leading #
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(window.location.search);

      // ── Google OAuth (implicit flow — access_token in hash) ──────────────
      const accessToken = hashParams.get('access_token');
      const hashError = hashParams.get('error');
      const hashState = hashParams.get('state'); // 'google'
      const expiresIn = parseInt(hashParams.get('expires_in') ?? '3600', 10);

      if (accessToken && hashState === 'google') {
        const expiry = Date.now() + expiresIn * 1000;
        deliver({ type: 'OAUTH_TOKEN', provider: 'google', token: accessToken, expiry });
        return;
      }

      if (hashError && hashState === 'google') {
        deliver({ type: 'OAUTH_ERROR', provider: 'google', error: hashError });
        return;
      }

      // ── OneDrive OAuth (PKCE code flow — code in query string) ───────────
      const code = searchParams.get('code');
      const queryState = searchParams.get('state');
      const queryError = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (queryError) {
        deliver({ type: 'OAUTH_ERROR', provider: 'onedrive', error: errorDescription ?? queryError });
        return;
      }

      if (code && queryState?.startsWith('onedrive')) {
        setStatus('Exchanging authorization code...');
        try {
          // Dynamic import to keep this page light
          const { exchangeOneDriveCode } = await import('@/lib/connectors/onedrive-connector');
          // [2026-05-01 Roy] refresh_token도 함께 전달 — 메인 탭에서 OneDriveConfig에
          // 저장하면 sync-runner가 토큰 만료 시 자동 refresh 가능. clientId/tenantId도
          // 함께 전달해야 refresh 호출 시 사용 가능.
          const { token, expiry, refreshToken, clientId, tenantId } = await exchangeOneDriveCode(code);
          deliver({
            type: 'OAUTH_TOKEN', provider: 'onedrive',
            token, expiry, refreshToken, clientId, tenantId,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Token exchange failed';
          setStatus(`Error: ${msg}`);
          deliver({ type: 'OAUTH_ERROR', provider: 'onedrive', error: msg });
        }
        return;
      }

      // Unknown / no params — just close
      setTimeout(() => window.close(), 300);
    }

    handleCallback();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-300 text-sm">
      {status} This window will close automatically.
    </div>
  );
}

// ── Helper: broadcast token to opener via all available channels ─────────────
function deliver(msg: object) {
  // 1. window.opener postMessage (desktop)
  try { window.opener?.postMessage(msg, window.location.origin); } catch {}

  // 2. BroadcastChannel (iOS Safari / Firefox — opener is null for new tab)
  try {
    const bc = new BroadcastChannel('oauth_callback');
    bc.postMessage(msg);
    setTimeout(() => { try { bc.close(); } catch {} }, 1000);
  } catch {}

  // 3. localStorage polling fallback
  try {
    localStorage.setItem('blend:oauth_result', JSON.stringify({ ...msg, ts: Date.now() }));
  } catch {}

  setTimeout(() => window.close(), 500);
}
