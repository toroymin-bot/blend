// [2026-04-12 01:07] 기능: URL 콘텐츠 서버 프록시 — 비활성화 이유: output:'export' 정적 빌드
// 클라이언트에서 직접 fetch 시도 (CORS 허용 사이트만 동작)

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ disabled: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* 원본 서버 핸들러는 url-reader.ts의 직접 클라이언트 fetch로 대체됨 */
