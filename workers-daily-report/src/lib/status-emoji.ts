// status → 이모지/라벨 매핑 (Tori 명세 v3 §4)

import type { TaskStatus, BugStatus, ImpStatus } from '../types';

export const TASK_STATUS: Record<TaskStatus, { emoji: string; label: string }> = {
  success:     { emoji: '✅', label: '성공' },
  failed:      { emoji: '❌', label: '실패' },
  in_progress: { emoji: '⏳', label: '진행 중' },
  skipped:     { emoji: '⏭', label: '건너뜀' },
};

export const BUG_STATUS: Record<BugStatus, { emoji: string; label: string }> = {
  resolved:         { emoji: '✅', label: '수정 완료' },
  found:            { emoji: '🔴', label: '신규 발견' },
  fix_requested:    { emoji: '🛠', label: '수정 요청' },
  re_test_pending:  { emoji: '🔄', label: '재테스트 대기' },
};

export const IMP_STATUS: Record<ImpStatus, { emoji: string; label: string }> = {
  applied:          { emoji: '✅', label: '적용' },
  pending_approval: { emoji: '🔵', label: '승인 대기' },
  approved:         { emoji: '👍', label: '승인됨' },
  declined:         { emoji: '🚫', label: '거절' },
};
