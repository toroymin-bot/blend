/**
 * /api/cron/sync-models — Tori 21102594 PR #3 (정적 stub).
 *
 * ⚠️ 현재 Blend는 Next.js `output: 'export'` 모드라 서버사이드 API 라우트가 실제 호출되지
 * 않음. 모든 /api/* 핸들러는 force-static 으로 빌드 시 스냅샷 됨.
 *
 * → Vercel Cron은 이 deployment 모델에선 작동하지 않음. 아래 두 가지 대안이 실제 작동:
 *
 *   1) GitHub Actions cron (권장, 비용 0원):
 *      .github/workflows/sync-models.yml — 매일 자정 KST 에 `npm run update-models:commit`
 *      실행하면 generated.json 갱신 + 자동 커밋 → Vercel 자동 재배포.
 *
 *   2) Vercel Deploy Hook + 외부 cron (cron-job.org 등):
 *      외부 cron이 매일 deploy hook URL 을 POST 호출 → build-time `update-models.ts` 재실행.
 *
 * 이 파일은 (a) 스펙의 의도를 코드로 남기고 (b) 미래 SSR 전환 시 즉시 활성화되도록 보존.
 *
 * 환경변수 (활성화 시 필요):
 *   CRON_SECRET, OPENAI_SYNC_KEY, ANTHROPIC_SYNC_KEY, GOOGLE_SYNC_KEY
 *   (또는 기존 _MODELS_KEY 패턴 호환)
 */

import { NextResponse } from 'next/server';

// output: 'export' 호환 — 정적 빌드 가능하도록 강제.
export const dynamic = 'force-static';

export async function GET() {
  // 스냅샷 빌드 시점에 실행되며 클라이언트가 fetch 시 반환되는 정적 응답.
  return NextResponse.json({
    ok: false,
    reason: 'static_export_mode',
    message:
      'Server-side cron not available under output:export. ' +
      'Use GitHub Actions or external cron + Vercel Deploy Hook to trigger npm run update-models:commit.',
    workaround: {
      githubActions: '.github/workflows/sync-models.yml (recommended)',
      manualCommand: 'npm run update-models:commit',
      registrySource: 'src/data/available-models.generated.json',
    },
    hint: 'See route.ts header comment for full setup notes.',
  });
}
