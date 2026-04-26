// Tori 명세 — 활성 소스 통합 타입 (Komi_Active_Sources_Bar_Unified_RAG_2026-04-25.md)
// 메인 채팅뷰의 ActiveSourcesBar에 표시되는 모든 자료 종류.
// 현재 Phase: documents만 구현. meeting / datasource-folder는 후속 PR.

export type ActiveSourceType = 'document' | 'meeting' | 'datasource-folder';

// [2026-04-26] RAG UX — 칩 색상 점 + 진행률 표시
export type ActiveSourceStatus = 'idle' | 'syncing' | 'ready' | 'error';

export interface ActiveSourceBase {
  id: string;                 // 통합 ID (타입 prefix, 예: "doc:abc123")
  type: ActiveSourceType;
  title: string;              // 칩 메인 텍스트
  subtitle?: string;          // 부가 정보 (예: 폴더 경로)
  icon: string;               // 이모지 또는 아이콘 키
  navigateTo: string;         // 본체 클릭 시 이동 경로
  chunkCount: number;         // RAG 청크 수 (디버그용)
  // [2026-04-26] 칩 상태 표시
  status?: ActiveSourceStatus;
  progress?: { current: number; total: number };
  errorMessage?: string;
}

export interface ActiveDocument extends ActiveSourceBase {
  type: 'document';
  documentId: string;
}

export interface ActiveMeeting extends ActiveSourceBase {
  type: 'meeting';
  meetingId: string;
}

export interface ActiveDataSourceFolder extends ActiveSourceBase {
  type: 'datasource-folder';
  dataSourceId: string;
  serviceName: 'google-drive' | 'onedrive';
  folderPath: string;
}

export type ActiveSource = ActiveDocument | ActiveMeeting | ActiveDataSourceFolder;
