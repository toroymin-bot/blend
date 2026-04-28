// Tori 명세 16384118 / DataSources Picker AutoSync Hotfix §1
// Active source chip status indicator dot.
//
// 5 states:
//   - ready    : 🟢 green  #22c55e   (검색 가능)
//   - syncing  : ⚪ gray   #9ca3af   pulse 1.6s (opacity 0.3↔1)
//   - error    : 🔴 red    #ef4444   (키 없음 / OAuth 만료 / 한도 초과)
//   - partial  : 🟡 yellow #eab308   (이미지 PDF / 일부만 추출, Tori PR #4)
//   - idle     : ready와 동일한 시각 처리 (키워드 검색만 가능한 상태)

import type { ActiveSourceStatus } from '@/types/active-source';

const COLOR: Record<ActiveSourceStatus, string> = {
  ready:   '#22c55e',
  syncing: '#9ca3af',
  error:   '#ef4444',
  partial: '#eab308',  // Tori 17989643 PR #4
  idle:    '#22c55e',  // 키워드 검색은 가능 → ready와 동일 노출
};

export function StatusDot({ status, size = 6 }: { status?: ActiveSourceStatus; size?: number }) {
  const s = status ?? 'idle';
  const isPulse = s === 'syncing';
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        marginRight: 8,
        background: COLOR[s],
        animation: isPulse ? 'd1-status-dot-pulse 1.6s ease-in-out infinite' : 'none',
      }}
    >
      <style jsx>{`
        @keyframes d1-status-dot-pulse {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 1; }
        }
      `}</style>
    </span>
  );
}
