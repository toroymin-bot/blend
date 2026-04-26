// blend-daily-report — 데이터 모델 (Tori 명세 v3)
// KOMI nighttask가 push하는 일일 요약 페이로드.

export type TaskStatus = 'success' | 'failed' | 'in_progress' | 'skipped';
export type BugStatus  = 'resolved' | 'found' | 'fix_requested' | 're_test_pending';
export type ImpStatus  = 'applied'  | 'pending_approval' | 'approved' | 'declined';

export interface TaskItem {
  title: string;
  status: TaskStatus;
  commitShas?: string[];
}

export interface BugItem {
  id: string;            // 예: "BUG-003"
  title: string;
  status: BugStatus;
  commitShas?: string[];
}

export interface ImpItem {
  id: string;            // 예: "IMP-007"
  title: string;
  status: ImpStatus;
  commitShas?: string[];
}

export interface SummaryStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  commitCount: number;
}

export interface SummaryLinks {
  qaTask?: string;
  devLogPage?: string;
  repo?: string;
}

export interface SummaryPayload {
  date: string;          // "YYYY-MM-DD"
  tasks?: TaskItem[];
  bugs?: BugItem[];
  improvements?: ImpItem[];
  stats?: SummaryStats;
  links?: SummaryLinks;
}

// Cloudflare Worker 환경 binding
export interface Env {
  BLEND_STATS: KVNamespace;
  KOMI_PUSH_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  GITHUB_REPO_URL: string;
  TIMEZONE: string;
}
