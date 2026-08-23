import type { Task } from "./types";

export const SCHEDULE_APPROVALS = ["미지정", "승인", "반려", "보류"] as const;
export type ScheduleApproval = (typeof SCHEDULE_APPROVALS)[number];

export function scheduleApprovalOf(task: Task): ScheduleApproval {
  const raw = task.scheduleApproval?.trim();
  if (raw === "승인" || raw === "반려" || raw === "보류") return raw;
  return "미지정";
}

export function countByScheduleApproval(tasks: Task[]): Record<ScheduleApproval, number> {
  const counts: Record<ScheduleApproval, number> = {
    미지정: 0,
    승인: 0,
    반려: 0,
    보류: 0,
  };
  for (const task of tasks) {
    counts[scheduleApprovalOf(task)] += 1;
  }
  return counts;
}
