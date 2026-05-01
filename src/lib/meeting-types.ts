// [2026-05-01 Roy] Meeting design1 view 내부에 있던 타입을 분리 — view, store,
// runner 세 모듈이 같은 타입을 공유해야 하는데 view에 두면 store/runner에서
// 순환 import가 됨. 글로벌 types/index.ts의 TranscriptSegment는 speaker가
// required라 design1과 충돌(design1은 optional). 충돌 회피용 별도 모듈.

export type ActionItem = {
  owner?: string;
  task: string;
  dueDate?: string;
  done?: boolean;
};

export type TranscriptSegment = {
  speaker?: string;
  text: string;
};

// Phase 3b (Tori 명세) — 활성 소스 칩 표시용 isActive 필드 추가
export type MeetingResult = {
  id: string;
  createdAt: number;
  title: string;
  duration?: string;
  participants?: number;
  summary: string[];
  actionItems: ActionItem[];
  decisions: string[];
  topics: string[];
  fullSummary: string;
  isActive?: boolean;
  transcript?: TranscriptSegment[];
};
