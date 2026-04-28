/**
 * Browser print → PDF 공통 helper.
 *
 * 배경: html2pdf.js + html2canvas 조합은 (1) 이미지 PDF만 생성 (텍스트 선택
 * 불가), (2) 다크모드 cascade 영향, (3) 한글 글리프 누락 위험, (4) 페이지
 * 분할 비결정적 등 문제 다발.
 *
 * 대안 (Tori 17989643 후속 / Roy 2026-04-28 결정):
 * window.open 한 새 창에 깔끔한 HTML 렌더 → 자동 print 다이얼로그.
 * 사용자가 "PDF로 저장" 선택 → OS-level 텍스트 PDF 생성.
 *
 * 장점:
 * - 텍스트 기반 PDF (선택·복사·검색 가능)
 * - 한글 폰트 OS가 처리 (글리프 누락 0)
 * - 다크모드 무관 (새 창은 light 스타일 강제)
 * - 페이지 분할 브라우저가 처리 (자동 줄바꿈 보존)
 *
 * 트레이드오프:
 * - 사용자 1 클릭 추가 (인쇄 다이얼로그 → "PDF로 저장")
 * - 브라우저별 다이얼로그 모양 다름
 *
 * 백그라운드로 jsPDF 기반 텍스트 PDF 모듈 구축 중 (Tori B 옵션). 완성 시
 * 자동 다운로드 흐름 복원.
 */

export interface PrintAsPDFOptions {
  /** 새 창의 <title> + 사용자가 PDF 저장 시 기본 파일명 힌트 */
  title: string;
  /** 본문 HTML (<style>은 자체 head에 자동 주입됨) */
  bodyHtml: string;
  /** 'ko' | 'en' — Pretendard / Geist 폰트 선택 */
  lang?: 'ko' | 'en';
  /** Print 다이얼로그 자동 호출 지연 (기본 400ms — 폰트 로딩 보장) */
  printDelayMs?: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 새 창 열어 HTML 렌더 → 자동 인쇄 다이얼로그.
 * 팝업 차단 시 throw.
 */
export function printHtmlAsPDF(opts: PrintAsPDFOptions): void {
  const {
    title,
    bodyHtml,
    lang = 'ko',
    printDelayMs = 400,
  } = opts;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    const err = new Error(
      lang === 'ko'
        ? '브라우저 팝업이 차단되어 있어요. 팝업을 허용하고 다시 시도해주세요.'
        : 'Popup is blocked. Allow popups for this site and try again.'
    ) as Error & { code?: string };
    err.code = 'POPUP_BLOCKED';
    throw err;
  }

  const fontFamily = lang === 'ko'
    ? `'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`
    : `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif`;

  const printNotice = lang === 'ko'
    ? `다이얼로그가 자동으로 열려요. 대상에서 <strong>"PDF로 저장"</strong>을 선택하세요.`
    : `The print dialog opens automatically. Choose <strong>"Save as PDF"</strong> as the destination.`;

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" rel="stylesheet">
  <style>
    @page { size: A4; margin: 15mm; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    html, body {
      color: #0a0a0a !important;
      background: #ffffff !important;
      color-scheme: light only;
    }
    body {
      font-family: ${fontFamily};
      line-height: 1.7;
      padding: 24px 32px 64px;
      max-width: 800px;
      margin: 0 auto;
      font-size: 14px;
    }
    h1 { font-size: 22px; margin: 0 0 6pt 0; font-weight: 700; letter-spacing: -0.01em; }
    h2 { font-size: 16px; margin: 18pt 0 6pt 0; font-weight: 600; }
    h3 { font-size: 14px; margin: 14pt 0 4pt 0; font-weight: 600; }
    p { margin: 6pt 0; }
    ul, ol { padding-left: 22px; margin: 6pt 0; }
    li { margin: 3pt 0; }
    hr { border: none; border-top: 1px solid #d4d0c8; margin: 14pt 0; }
    .meta { color: #6b6862; font-size: 11px; line-height: 1.5; }
    .source { color: #6b6862; font-size: 11px; margin-top: 18pt; padding-top: 8pt; border-top: 1px dashed #d4d0c8; }
    .footer { color: #a8a49b; font-size: 10px; margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #e6e2dc; text-align: center; font-style: italic; }
    table { border-collapse: collapse; margin: 8pt 0; width: 100%; }
    th, td { border: 1px solid #d4d0c8; padding: 6pt 8pt; text-align: left; vertical-align: top; }
    th { background: #f5f3ee; font-weight: 600; }
    pre { background: #f5f3ee; padding: 8pt; border-radius: 4px; overflow: auto; font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 12px; }
    code { background: #f5f3ee; padding: 1px 4px; border-radius: 3px; font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 12.5px; }
    .print-banner {
      position: sticky; top: 0;
      background: #fff5f0;
      border-bottom: 1px solid #f0c8b8;
      padding: 10px 16px;
      font-size: 12px;
      color: #6b3a1f;
      text-align: center;
      margin: -24px -32px 18px;
      z-index: 100;
    }
    .print-btn {
      display: inline-block;
      margin-left: 12px;
      padding: 4px 12px;
      background: #c65a3c;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
    }
    .print-btn:hover { background: #a04829; }
  </style>
</head>
<body>
  <div class="print-banner no-print">
    ${printNotice}
    <button class="print-btn" onclick="window.print()" type="button">${lang === 'ko' ? '다시 인쇄' : 'Print again'}</button>
  </div>
  ${bodyHtml}
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  // 폰트 로딩 + DOM 안정화 후 자동 인쇄
  const tryPrint = () => {
    try {
      // 일부 브라우저는 onload보다 fonts.ready가 더 정확
      if (win.document.fonts && typeof win.document.fonts.ready?.then === 'function') {
        win.document.fonts.ready.then(() => {
          setTimeout(() => win.print(), printDelayMs);
        }).catch(() => setTimeout(() => win.print(), printDelayMs));
      } else {
        setTimeout(() => win.print(), printDelayMs);
      }
    } catch {
      // 새 창의 cross-origin 경계 등 — 그냥 시도
      setTimeout(() => win.print(), printDelayMs);
    }
  };

  if (win.document.readyState === 'complete') {
    tryPrint();
  } else {
    win.addEventListener('load', tryPrint, { once: true });
  }
}
