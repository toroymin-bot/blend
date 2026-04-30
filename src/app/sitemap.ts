/**
 * sitemap.xml — Tori 16220538 v3 §3.4.
 *
 * 모든 사용자 진입 URL은 /design1/ prefix. legacy /[lang] 은 client-side redirect
 * 되므로 sitemap에서 제외 (SEO에서 design1 정본만 인덱싱).
 *
 * `output: 'export'` 호환 — Next.js가 build 시점에 정적 sitemap.xml로 출력.
 */

import type { MetadataRoute } from 'next';

// output: 'export' 호환 — sitemap을 정적 빌드 산출물로 강제.
export const dynamic = 'force-static';

const SITE = 'https://blend.ai4min.com';
const LANGS = ['ko', 'en'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const lang of LANGS) {
    entries.push({
      url:        `${SITE}/design1/${lang}`,
      lastModified,
      changeFrequency: 'daily',
      priority:   1.0,
    });
    // qatest, share 는 외부 진입점이 아님 — 인덱싱 X (priority 낮춤)
    entries.push({
      url:        `${SITE}/design1/${lang}/qatest`,
      lastModified,
      changeFrequency: 'monthly',
      priority:   0.3,
    });
  }

  // 정적 정책 페이지
  for (const path of ['privacy', 'terms', 'refund', 'pricing']) {
    entries.push({
      url:        `${SITE}/${path}`,
      lastModified,
      changeFrequency: 'monthly',
      priority:   0.5,
    });
  }

  return entries;
}
