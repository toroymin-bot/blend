// [2026-05-01 Roy] 회의 분석 진행 상태 — 컴포넌트 lifecycle과 분리.
// 데이터 소스 sync-runner와 동일 패턴: module-level runner가 store에 진행을
// 갱신, 컴포넌트는 store를 구독해 UI 렌더링만. 사용자가 다른 메뉴로 이동해
// 컴포넌트가 unmount돼도 분석은 계속 진행되고, 다시 마운트되면 store에서
// 진행 상태를 읽어 자연스럽게 복원.
//
// 새로고침은 JS 메모리 reset이라 분석 중단 — 어쩔 수 없음 (모든 SPA 동일).
// 결과는 완료 시 localStorage/IDB에 저장돼 새로고침 후에도 history에서 보임.

import { create } from 'zustand';
import type { MeetingResult } from '@/lib/meeting-types';

export type AnalyzeStage =
  | 'idle'
  | 'transcribing' // 음성 → 텍스트 (Whisper / Gemini STT)
  | 'diarizing'    // 화자 분리
  | 'analyzing'    // LLM 회의 분석 (요약/액션/결정사항)
  | 'done'
  | 'error';

interface MeetingJob {
  id: string;
  stage: AnalyzeStage;
  /** 사용자에게 보일 진행 라벨 — '음성 변환 중', '화자 분리 중' 등 */
  label: string;
  /** stage='error'면 사용자에게 보일 사유 */
  errorMsg?: string;
  /** stage='done'면 결과 — 컴포넌트가 history에 push */
  result?: MeetingResult;
  /** 시작 시각 — 새 분석이 들어오면 이전 job을 superseded 처리 */
  startedAt: number;
}

interface MeetingJobState {
  job: MeetingJob | null;

  /** runner가 호출 — 분석 시작 */
  beginJob: (id: string, label: string) => void;
  /** runner가 호출 — stage 갱신 */
  setStage: (id: string, stage: AnalyzeStage, label?: string) => void;
  /** runner가 호출 — 완료 (result는 컴포넌트에서 history에 push) */
  finishJob: (id: string, result: MeetingResult) => void;
  /** runner가 호출 — 실패 */
  failJob: (id: string, errorMsg: string) => void;
  /** 컴포넌트가 결과 처리 후 호출 — job 상태 클리어해 idle로 */
  clearJob: () => void;
}

export const useMeetingJobStore = create<MeetingJobState>((set, get) => ({
  job: null,

  beginJob: (id, label) =>
    set({
      job: { id, stage: 'transcribing', label, startedAt: Date.now() },
    }),

  setStage: (id, stage, label) => {
    const cur = get().job;
    // 동일 job만 갱신 — 새 job이 시작됐으면 옛 단계 콜백은 무시.
    if (!cur || cur.id !== id) return;
    set({ job: { ...cur, stage, label: label ?? cur.label } });
  },

  finishJob: (id, result) => {
    const cur = get().job;
    if (!cur || cur.id !== id) return;
    set({ job: { ...cur, stage: 'done', label: '', result } });
  },

  failJob: (id, errorMsg) => {
    const cur = get().job;
    if (!cur || cur.id !== id) return;
    set({ job: { ...cur, stage: 'error', errorMsg, label: '' } });
  },

  clearJob: () => set({ job: null }),
}));
