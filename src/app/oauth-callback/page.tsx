'use client';

// OAuth 2.0 Implicit Flow callback page
// Both Google and OneDrive redirect here after authorization.
// Parses the hash fragment, posts the token back to the opener, then closes.
//
// Three delivery methods for the token, to handle all browsers/platforms:
//  1. window.opener.postMessage — works on desktop browsers
//  2. BroadcastChannel       — works on iOS Safari / Firefox where opener is null
//  3. localStorage            — ultimate fallback (polled by the connector)

import { useEffect } from 'react';

export default function OAuthCallback() {
  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove leading #
    const params = new URLSearchParams(hash);
    const search = new URLSearchParams(window.location.search);

    const accessToken = params.get('access_token');
    const error = params.get('error') ?? search.get('error');
    const state = params.get('state') ?? search.get('state'); // 'google' | 'onedrive'
    const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);
    const expiry = Date.now() + expiresIn * 1000;

    const msg = accessToken && state
      ? { type: 'OAUTH_TOKEN', provider: state, token: accessToken, expiry }
      : error
      ? { type: 'OAUTH_ERROR', provider: state ?? 'unknown', error }
      : null;

    if (!msg) { setTimeout(() => window.close(), 300); return; }

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
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-300 text-sm">
      인증 처리 중... 이 창은 자동으로 닫힙니다.
    </div>
  );
}
