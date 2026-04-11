// [2026-04-12 01:07] 기능: YouTube 자막 서버 추출 — 비활성화 이유: output:'export' 정적 빌드 (Node.js only 라이브러리)
// 클라이언트에서 YouTube timedtext API 직접 호출로 대체됨

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ disabled: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* 원본 서버 핸들러는 meeting-view.tsx의 직접 클라이언트 fetch로 대체됨 */
