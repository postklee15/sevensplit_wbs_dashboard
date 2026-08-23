import type { AccessProfile } from "./acl";
import { alertAlreadySent, listProjectPms, writeAlertLog } from "./alertStore";
import { NO_SERVICE, progressRatio, taskStatus, todayKst } from "./metrics";
import { fetchWbsTasks } from "./notion";
import { scheduleApprovalOf } from "./scheduleApproval";
import { lookupSlackUserId, sendSlackDm, slackBotToken } from "./slack";
import type { Task } from "./types";

const DASHBOARD = "https://sevensplit-wbs-dashboard.web.app";
const MAX_TASKS_IN_MESSAGE = 20;

export type AlertSkip =
  | "no-pm"
  | "pm-not-found"
  | "no-slack"
  | "already-sent"
  | "no-assignee"
  | "assignee-not-found"
  | "dry-run"
  | "sent"
  | "send-failed";

export type AlertPreviewRow = {
  kind: "unassigned" | "overdue";
  recipientUid: string;
  recipientName: string;
  slackUserId: string;
  service: string;
  taskCount: number;
  skip: AlertSkip;
  sampleTitles: string[];
};

export type AlertRunResult = {
  dateKst: string;
  dryRun: boolean;
  preview: AlertPreviewRow[];
  sent: number;
  skipped: number;
  errors: string[];
};

type RunOpts = {
  firestoreToken: string;
  users: AccessProfile[];
  dryRun: boolean;
  force?: boolean;
};

type Group = {
  kind: "unassigned" | "overdue";
  recipient: AccessProfile;
  service: string;
  tasks: Task[];
};

function pathOf(task: Task): string {
  return [...task.ancestorTitles, task.title].join(" / ");
}

function missingBits(task: Task): string {
  const bits: string[] = [];
  if (task.assignees.length === 0) bits.push("담당자 없음");
  if (!task.start && !task.end) bits.push("일정 없음");
  return bits.join(", ");
}

function byWorkName(users: AccessProfile[]): Map<string, AccessProfile> {
  const map = new Map<string, AccessProfile>();
  for (const user of users) {
    const name = user.workName.trim();
    if (name) map.set(name, user);
  }
  return map;
}

function unassignedLeaves(tasks: Task[]): Task[] {
  return tasks.filter(
    (task) => task.isLeaf && (task.assignees.length === 0 || (!task.start && !task.end)),
  );
}

function overdueLeaves(tasks: Task[], date: string): Task[] {
  return tasks.filter(
    (task) => task.isLeaf && taskStatus(task, date) === "기한초과" && progressRatio(task) < 1,
  );
}

async function resolveSlackId(
  botToken: string,
  user: AccessProfile,
  cache: Map<string, string>,
): Promise<string> {
  const override = user.slackMemberId.trim();
  if (override) return override;
  if (!botToken) return "";
  const email = user.email.trim().toLowerCase();
  const cached = cache.get(email);
  if (cached !== undefined) return cached;
  try {
    const id = (await lookupSlackUserId(botToken, user.email)) ?? "";
    cache.set(email, id);
    return id;
  } catch {
    cache.set(email, "");
    return "";
  }
}

function formatUnassigned(service: string, tasks: Task[]): string {
  const head = tasks.slice(0, MAX_TASKS_IN_MESSAGE);
  const extra = tasks.length - head.length;
  const lines = [
    `[WBS] 담당자·일정이 비어 있는 작업 ${tasks.length}건`,
    `서비스: ${service}`,
    `대시보드: ${DASHBOARD}`,
    "",
    "아래 작업에 담당자와 시작·종료일을 넣어 주세요.",
    "",
  ];
  for (const task of head) {
    lines.push(`• ${pathOf(task)}`);
    lines.push(`  ${missingBits(task)}`);
    if (task.url) lines.push(`  ${task.url}`);
  }
  if (extra > 0) lines.push(`… 외 ${extra}건`);
  return lines.join("\n");
}

function formatOverdue(tasks: Task[]): string {
  const head = tasks.slice(0, MAX_TASKS_IN_MESSAGE);
  const extra = tasks.length - head.length;
  const lines = [
    `[WBS] 기한이 지난 미완료 작업 ${tasks.length}건`,
    `대시보드: ${DASHBOARD}`,
    "",
    "완료(진척 100%)로 바꾸거나, 일정승인을 「지연」으로 바꾸고 지연 사유와 새 일정을 수정해 주세요.",
    "",
  ];
  for (const task of head) {
    const delayed = scheduleApprovalOf(task) === "지연" ? " (일정승인: 지연)" : "";
    lines.push(`• ${pathOf(task)}${delayed}`);
    lines.push(`  종료 ${task.end ?? "—"} · 진척 ${Math.round(progressRatio(task) * 100)}%`);
    if (task.url) lines.push(`  ${task.url}`);
  }
  if (extra > 0) lines.push(`… 외 ${extra}건`);
  return lines.join("\n");
}

function previewRow(
  group: Group,
  skip: AlertSkip,
  slackUserId = "",
): AlertPreviewRow {
  return {
    kind: group.kind,
    recipientUid: group.recipient.uid,
    recipientName: group.recipient.workName || group.recipient.email,
    slackUserId,
    service: group.service,
    taskCount: group.tasks.length,
    skip,
    sampleTitles: group.tasks.slice(0, 3).map((task) => task.title),
  };
}

export async function runAlertJob(opts: RunOpts): Promise<AlertRunResult> {
  const dateKst = todayKst();
  const errors: string[] = [];
  const preview: AlertPreviewRow[] = [];
  let sent = 0;
  let skipped = 0;

  const botToken = slackBotToken();
  const slackCache = new Map<string, string>();
  const { tasks } = await fetchWbsTasks();
  const pms = await listProjectPms(opts.firestoreToken);
  const pmByService = new Map(pms.map((row) => [row.service, row.pmUid]));
  const userByUid = new Map(opts.users.map((user) => [user.uid, user]));
  const userByName = byWorkName(opts.users);
  const groups: Group[] = [];

  const unassignedByService = new Map<string, Task[]>();
  for (const task of unassignedLeaves(tasks)) {
    const service = task.service || NO_SERVICE;
    const list = unassignedByService.get(service) ?? [];
    list.push(task);
    unassignedByService.set(service, list);
  }

  for (const [service, serviceTasks] of unassignedByService) {
    const pmUid = pmByService.get(service);
    if (!pmUid) {
      preview.push({
        kind: "unassigned",
        recipientUid: "",
        recipientName: "",
        slackUserId: "",
        service,
        taskCount: serviceTasks.length,
        skip: "no-pm",
        sampleTitles: serviceTasks.slice(0, 3).map((task) => task.title),
      });
      skipped += 1;
      continue;
    }
    const pm = userByUid.get(pmUid);
    if (!pm) {
      preview.push({
        kind: "unassigned",
        recipientUid: pmUid,
        recipientName: "",
        slackUserId: "",
        service,
        taskCount: serviceTasks.length,
        skip: "pm-not-found",
        sampleTitles: serviceTasks.slice(0, 3).map((task) => task.title),
      });
      skipped += 1;
      continue;
    }
    groups.push({ kind: "unassigned", recipient: pm, service, tasks: serviceTasks });
  }

  const overdueByUid = new Map<string, { user: AccessProfile; tasks: Task[] }>();
  for (const task of overdueLeaves(tasks, dateKst)) {
    if (task.assignees.length === 0) {
      preview.push({
        kind: "overdue",
        recipientUid: "",
        recipientName: "",
        slackUserId: "",
        service: task.service || NO_SERVICE,
        taskCount: 1,
        skip: "no-assignee",
        sampleTitles: [task.title],
      });
      skipped += 1;
      continue;
    }
    for (const name of task.assignees) {
      const user = userByName.get(name);
      if (!user) {
        preview.push({
          kind: "overdue",
          recipientUid: "",
          recipientName: name,
          slackUserId: "",
          service: task.service || NO_SERVICE,
          taskCount: 1,
          skip: "assignee-not-found",
          sampleTitles: [task.title],
        });
        skipped += 1;
        continue;
      }
      const bucket = overdueByUid.get(user.uid) ?? { user, tasks: [] };
      bucket.tasks.push(task);
      overdueByUid.set(user.uid, bucket);
    }
  }

  for (const { user, tasks: userTasks } of overdueByUid.values()) {
    groups.push({
      kind: "overdue",
      recipient: user,
      service: userTasks[0]?.service || NO_SERVICE,
      tasks: userTasks,
    });
  }

  for (const group of groups) {
    const slackUserId = await resolveSlackId(botToken, group.recipient, slackCache);
    if (!slackUserId) {
      preview.push(previewRow(group, "no-slack"));
      skipped += 1;
      continue;
    }

    const already =
      !opts.force &&
      (await alertAlreadySent(opts.firestoreToken, group.kind, group.recipient.uid, dateKst));
    if (already) {
      preview.push(previewRow(group, "already-sent", slackUserId));
      skipped += 1;
      continue;
    }

    if (opts.dryRun) {
      preview.push(previewRow(group, "dry-run", slackUserId));
      skipped += 1;
      continue;
    }

    const text =
      group.kind === "unassigned"
        ? formatUnassigned(group.service, group.tasks)
        : formatOverdue(group.tasks);
    const taskIds = group.tasks.map((task) => task.id);

    try {
      await sendSlackDm(botToken, slackUserId, text);
      await writeAlertLog(opts.firestoreToken, {
        kind: group.kind,
        recipientUid: group.recipient.uid,
        dateKst,
        taskIds,
        ok: true,
      });
      preview.push(previewRow(group, "sent", slackUserId));
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${group.kind} → ${group.recipient.email}: ${message}`);
      await writeAlertLog(opts.firestoreToken, {
        kind: group.kind,
        recipientUid: group.recipient.uid,
        dateKst,
        taskIds,
        ok: false,
        error: message,
      }).catch(() => undefined);
      preview.push(previewRow(group, "send-failed", slackUserId));
      skipped += 1;
    }
  }

  return { dateKst, dryRun: opts.dryRun, preview, sent, skipped, errors };
}
