export type Task = {
  id: string;
  title: string;
  url: string;
  /** 루트 → 직계 상위. 자신은 제외. */
  ancestorTitles: string[];
  assignees: string[];
  service: string | null;
  attribute: string | null;
  progress: number | null;
  allocation: number | null;
  effortDays: number | null;
  start: string | null;
  end: string | null;
  scheduleApproval: string | null;
  deployApproval: string | null;
  issue: string;
  isLeaf: boolean;
};

export type TaskStatus = "완료" | "진행중" | "예정" | "기한초과" | "일정없음";

export type PersonRow = {
  name: string;
  taskCount: number;
  open: number;
  done: number;
  inProgress: number;
  upcoming: number;
  overdue: number;
  noDate: number;
  remainingDays: number;
  weeklyLoad: number[];
  /** 주차별 월–금 일간 부하. `dailyLoad[weekIndex][0=월 … 4=금]` */
  dailyLoad: number[][];
  unscheduledDays: number;
};

export type DashboardPayload = {
  fetchedAt: string;
  databaseTitle: string;
  tasks: Task[];
};
