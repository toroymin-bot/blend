// [2026-04-12 01:07] 기능: WebDAV CORS 프록시 — 비활성화 이유: output:'export' 정적 빌드
// WebDAV는 서버 없이는 CORS 제한으로 대부분의 서버에서 동작 불가

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ disabled: true, message: 'WebDAV proxy requires a server. Use direct WebDAV if your server supports CORS.' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* 원본 서버 핸들러는 webdav-connector.ts에서 직접 WebDAV 시도로 대체됨 */
