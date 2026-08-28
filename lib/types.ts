import type { OrgMember, OrgUnit } from "./org";

export type AssigneePerson = {
  id: string;
  name: string;
};

export type Task = {
  id: string;
  title: string;
  url: string;
  /** 루트 → 직계 상위. 자신은 제외. */
  ancestorTitles: string[];
  assignees: string[];
  /** 노션 people id. 담당자 쓰기에 사용. */
  assigneePeople: AssigneePerson[];
  /** 이 행에 적힌 서비스. 비어 있으면 목록 `service`는 상위 상속값. */
  ownService: string | null;
  /** 노션 서비스. 비어 있으면 상위 트리에서 가장 가까운 값을 상속. */
  service: string | null;
  attribute: string | null;
  importance: string | null;
  progress: number | null;
  allocation: number | null;
  effortDays: number | null;
  /** 노션 추가일정. 양수일 때만 종료일을 달력 일수만큼 연장. */
  extraDays: number | null;
  start: string | null;
  end: string | null;
  scheduleApproval: string | null;
  deployApproval: string | null;
  issue: string;
  delayReason: string | null;
  isLeaf: boolean;
  /** 트리 부모. 없으면 최상위. */
  parentId: string | null;
};

export type WbsFieldKey =
  | "title"
  | "service"
  | "attribute"
  | "importance"
  | "assignees"
  | "schedule"
  | "extraDays"
  | "scheduleApproval"
  | "deployApproval"
  | "progress"
  | "allocation"
  | "effortDays"
  | "delayReason"
  | "issue";

export type NotionWriteType =
  | "title"
  | "select"
  | "multi_select"
  | "status"
  | "people"
  | "date"
  | "number"
  | "rich_text";

export type WbsFieldSchema = {
  property: string;
  type: string;
  options: string[];
  writable: boolean;
  numberFormat: string | null;
};

export type WbsSchema = {
  fields: Partial<Record<WbsFieldKey, WbsFieldSchema>>;
  people: AssigneePerson[];
};

export type TaskPatch = {
  title?: string;
  service?: string | null;
  attribute?: string | null;
  importance?: string | null;
  assigneeIds?: string[];
  start?: string | null;
  end?: string | null;
  extraDays?: number | null;
  scheduleApproval?: string | null;
  deployApproval?: string | null;
  progress?: number | null;
  allocation?: number | null;
  effortDays?: number | null;
  delayReason?: string | null;
  issue?: string | null;
};

export type TaskWriteBody = TaskPatch & {
  /** 최상위 지연 저장 시 하위에도 추가 일정·지연사유·일정승인(지연)을 복사 */
  cascadeDelay?: boolean;
};

export type TaskStatus = "완료" | "진행중" | "예정" | "기한초과" | "기한연장" | "일정없음";

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
  org?: {
    units: OrgUnit[];
    members: OrgMember[];
  };
};

export type CsItem = {
  id: string;
  title: string;
  url: string;
  service: string | null;
  status: string | null;
  receivedAt: string | null;
  assignees: string[];
};

export type CsSchema = {
  statusProperty: string | null;
  statusType: string | null;
  statusOptions: string[];
  writable: boolean;
};

export type CsPayload = {
  fetchedAt: string;
  databaseTitle: string;
  items: CsItem[];
  schema: CsSchema;
};
