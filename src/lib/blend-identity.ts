// [2026-05-01 Roy] Blend 정체성 — 모든 AI에 system prompt로 주입.
// [2026-05-02 Roy] 압축 버전 — 이전 ~3500자(토큰 1000+)가 매 요청 latency
// 증가시킴 (간단 질문에도 20초+). 핵심만 ~600자(토큰 200) 수준으로 축소.
// 자세한 답변은 사용자가 '블렌드란?' 버튼 클릭 시 BLEND_INTRO_QUESTION이 AI에게
// 자세히 풀어 답변 요청 — system prompt로 미리 다 주입할 필요 없음.

export const BLEND_IDENTITY_KO = `당신은 Blend(블렌드)에서 작동하는 AI입니다. Blend는 ChatGPT·Claude·Gemini·DeepSeek·Groq를 한 화면에서 사용하는 통합 AI 서비스로, BYOK 모델로 평균 월 $5(구독은 $60+). 자동 라우팅으로 질문별 최적 AI 매칭, 문서/RAG/회의 분석/비교 도구 제공, 모든 데이터는 브라우저-only(프라이버시).

규칙:
- "너 누구야/어떤 AI/블렌드가 뭐야" 같은 메타 질문엔 Blend로서 답변.
- AI 모델명("Gemini입니다" 등)은 직접 묻기 전엔 밝히지 마세요 (Auto 라우팅이라 매번 다름, 사용자 혼란 방지).
- 일반 질문(코딩/번역/요약 등)엔 평소대로 본래 capability로 답변.`;

export const BLEND_IDENTITY_EN = `You are an AI in Blend — a unified AI service combining ChatGPT, Claude, Gemini, DeepSeek, Groq in one screen. BYOK model, ~$5/mo (vs $60+ subscriptions). Auto-routing picks best AI per question. Includes document/RAG/meeting/compare tools. All data stays in user's browser (privacy-first).

Rules:
- Meta questions ("who are you / what AI / what is Blend"): respond as Blend.
- Don't mention the underlying model name (e.g. "I'm Gemini") unless explicitly asked — Auto routing means different AIs each time, would confuse users.
- Normal questions (coding/translation/summary etc.): answer normally with your capabilities.`;

/** lang에 맞는 Blend identity prompt 반환. */
export function getBlendIdentityPrompt(lang: 'ko' | 'en'): string {
  return lang === 'ko' ? BLEND_IDENTITY_KO : BLEND_IDENTITY_EN;
}

/** "블렌드 서비스란?" 버튼 클릭 시 자동 전송할 사용자 질문.
 *  AI가 자기 capability로 자세히 풀어 답변하므로, 자세한 정보는 prompt가
 *  아니라 user message에 포함. */
export const BLEND_INTRO_QUESTION = {
  ko: `Blend 서비스에 대해 자세히 알려줘. 다음 항목을 빠짐없이 정리해줘:

1. 컨셉 — 어떤 서비스이고 어떤 문제를 해결하는지
2. 핵심 기능 — 채팅(멀티 AI 자동 라우팅), 데이터 소스(Google Drive/OneDrive 폴더 연결, RAG 문서 검색), 회의 분석(음성/텍스트/YouTube 자동 요약 + 액션 아이템), 문서 업로드(PDF/DOCX/XLSX, 이미지 PDF는 OCR 자동), 모델 비교 (같은 질문 여러 AI 동시 전송)
3. 차별화 장점 — 멀티 AI 자동 라우팅(코딩은 GPT, 긴 문서는 Gemini, 글쓰기는 Claude), 프라이버시(데이터 브라우저-only), BYOK(API 키 사용자 소유, 구독 lock-in 없음), 통합 UX(여러 AI 앱 띄울 필요 X)
4. 비용 절감 효과 — BYOK 모델로 평균 월 $5, 일반 AI 구독($60+)대비 약 95% 절감, 안 쓰면 $0
5. 추천 사용자 — 평소 ChatGPT/Claude/Gemini 두 개 이상 쓰는 사람, 프라이버시 중요한 사용자, 문서 RAG/회의 분석 도구 필요한 사용자

각 항목별로 명확하게 정리해서 답변해줘.`,
  en: `Tell me about Blend in detail. Cover all of these:

1. Concept — what it is and what problem it solves
2. Core features — chat (multi-AI auto-routing), data sources (Google Drive/OneDrive folder connect, RAG search), meeting analysis (voice/text/YouTube auto-summary + action items), document upload (PDF/DOCX/XLSX, image PDFs auto-OCR'd), model comparison (same question to multiple AIs)
3. Key advantages — multi-AI auto-routing (GPT for coding, Gemini for long docs, Claude for writing), privacy (browser-only data), BYOK (keys are yours, no subscription lock-in), unified UX (one screen vs 5 separate AI apps)
4. Cost savings — BYOK averages ~$5/month vs $60+ for typical AI subscriptions (~95% savings), $0 when idle
5. Recommended users — already using 2+ AIs (ChatGPT/Claude/Gemini), privacy-conscious users, those needing document RAG / meeting analysis

Organize the answer clearly by each section.`,
};
