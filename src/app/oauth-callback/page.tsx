'use client';

// OAuth 2.0 Implicit Flow callback page
// Both Google and OneDrive redirect here after authorization.
// Parses the hash fragment, posts the token back to the opener, then closes.

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

    if (accessToken && state) {
      window.opener?.postMessage(
        { type: 'OAUTH_TOKEN', provider: state, token: accessToken, expiry },
        window.location.origin
      );
    } else if (error) {
      window.opener?.postMessage(
        { type: 'OAUTH_ERROR', provider: state ?? 'unknown', error },
        window.location.origin
      );
    }

    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-300 text-sm">
      인증 처리 중... 이 창은 자동으로 닫힙니다.
    </div>
  );
}
