import type { AccessProfile } from "./acl";
import { alertAlreadySent, listCsOwners, writeAlertLog, type CsOwner } from "./alertStore";
import { isUnresolvedCs, NO_CS_SERVICE } from "./cs";
import { fetchCsItems } from "./csNotion";
import { isWeekendKst, todayKst } from "./metrics";
import { lookupSlackUserId, sendSlackDm, slackBotToken } from "./slack";
import type { CsItem } from "./types";

const DASHBOARD = "https://sevensplit-wbs-dashboard.web.app/cs";
const MAX_ITEMS_IN_MESSAGE = 20;

export type CsAlertSkip =
  | "no-owner"
  | "owner-not-found"
  | "empty-team"
  | "no-slack"
  | "already-sent"
  | "dry-run"
  | "sent"
  | "send-failed"
  | "weekend";

export type CsAlertPreviewRow = {
  kind: "cs-unresolved";
  recipientUid: string;
  recipientName: string;
  slackUserId: string;
  service: string;
  taskCount: number;
  skip: CsAlertSkip;
  sampleTitles: string[];
};

export type CsAlertRunResult = {
  dateKst: string;
  dryRun: boolean;
  weekend: boolean;
  preview: CsAlertPreviewRow[];
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
  recipient: AccessProfile;
  items: CsItem[];
};

function previewRow(
  recipient: AccessProfile | null,
  items: CsItem[],
  skip: CsAlertSkip,
  slackUserId = "",
  service = "",
): CsAlertPreviewRow {
  const services = [...new Set(items.map((item) => item.service || NO_CS_SERVICE))];
  return {
    kind: "cs-unresolved",
    recipientUid: recipient?.uid ?? "",
    recipientName: recipient ? recipient.workName || recipient.email : "",
    slackUserId,
    service: service || services.join(", "),
    taskCount: items.length,
    skip,
    sampleTitles: items.slice(0, 3).map((item) => item.title),
  };
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

function recipientsForOwner(
  owner: CsOwner,
  users: AccessProfile[],
  userByUid: Map<string, AccessProfile>,
): AccessProfile[] {
  if (!owner.ownerId) return [];
  if (owner.ownerKind === "user") {
    const user = userByUid.get(owner.ownerId);
    return user ? [user] : [];
  }
  return users.filter((user) => user.teamId === owner.ownerId);
}

function formatMessage(items: CsItem[]): string {
  const byService = new Map<string, CsItem[]>();
  for (const item of items) {
    const service = item.service || NO_CS_SERVICE;
    const list = byService.get(service) ?? [];
    list.push(item);
    byService.set(service, list);
  }
  const serviceLine = [...byService.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([service, list]) => `${service} (${list.length}건)`)
    .join(", ");
  const head = items.slice(0, MAX_ITEMS_IN_MESSAGE);
  const extra = items.length - head.length;
  const lines = [
    `[CS] 미해결 문의 ${items.length}건`,
    `서비스: ${serviceLine}`,
    `대시보드: ${DASHBOARD}`,
    "",
    "미해결 CS가 있습니다. 상태를 바꾸거나 노션에서 처리해 주세요.",
    "",
  ];
  for (const item of head) {
    lines.push(`• ${item.title}`);
    lines.push(`  ${item.service || NO_CS_SERVICE} · ${item.status || "상태 없음"}`);
    if (item.url) lines.push(`  ${item.url}`);
  }
  if (extra > 0) lines.push(`… 외 ${extra}건`);
  return lines.join("\n");
}

export async function runCsAlertJob(opts: RunOpts): Promise<CsAlertRunResult> {
  const dateKst = todayKst();
  const weekend = isWeekendKst(dateKst);
  const errors: string[] = [];
  const preview: CsAlertPreviewRow[] = [];
  let sent = 0;
  let skipped = 0;

  const botToken = slackBotToken();
  const slackCache = new Map<string, string>();
  const { items } = await fetchCsItems();
  const unresolved = items.filter((item) => isUnresolvedCs(item.status));
  const owners = await listCsOwners(opts.firestoreToken);
  const ownerByService = new Map(owners.map((row) => [row.service, row]));
  const userByUid = new Map(opts.users.map((user) => [user.uid, user]));

  const unresolvedByService = new Map<string, CsItem[]>();
  for (const item of unresolved) {
    const service = item.service || NO_CS_SERVICE;
    const list = unresolvedByService.get(service) ?? [];
    list.push(item);
    unresolvedByService.set(service, list);
  }

  const bucket = new Map<string, Group>();

  for (const [service, serviceItems] of unresolvedByService) {
    const owner = ownerByService.get(service);
    if (!owner?.ownerId) {
      preview.push(previewRow(null, serviceItems, "no-owner", "", service));
      skipped += 1;
      continue;
    }
    const recipients = recipientsForOwner(owner, opts.users, userByUid);
    if (recipients.length === 0) {
      preview.push(
        previewRow(null, serviceItems, owner.ownerKind === "team" ? "empty-team" : "owner-not-found", "", service),
      );
      skipped += 1;
      continue;
    }
    for (const recipient of recipients) {
      const group = bucket.get(recipient.uid) ?? { recipient, items: [] };
      group.items.push(...serviceItems);
      bucket.set(recipient.uid, group);
    }
  }

  for (const group of bucket.values()) {
    const slackUserId = await resolveSlackId(botToken, group.recipient, slackCache);
    if (!slackUserId) {
      preview.push(previewRow(group.recipient, group.items, "no-slack"));
      skipped += 1;
      continue;
    }
    if (weekend) {
      preview.push(previewRow(group.recipient, group.items, "weekend", slackUserId));
      skipped += 1;
      continue;
    }
    const already =
      !opts.force &&
      (await alertAlreadySent(opts.firestoreToken, "cs-unresolved", group.recipient.uid, dateKst));
    if (already) {
      preview.push(previewRow(group.recipient, group.items, "already-sent", slackUserId));
      skipped += 1;
      continue;
    }
    if (opts.dryRun) {
      preview.push(previewRow(group.recipient, group.items, "dry-run", slackUserId));
      skipped += 1;
      continue;
    }
    try {
      await sendSlackDm(botToken, slackUserId, formatMessage(group.items));
      await writeAlertLog(opts.firestoreToken, {
        kind: "cs-unresolved",
        recipientUid: group.recipient.uid,
        dateKst,
        taskIds: group.items.map((item) => item.id),
        ok: true,
      });
      preview.push(previewRow(group.recipient, group.items, "sent", slackUserId));
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`cs-unresolved → ${group.recipient.email}: ${message}`);
      await writeAlertLog(opts.firestoreToken, {
        kind: "cs-unresolved",
        recipientUid: group.recipient.uid,
        dateKst,
        taskIds: group.items.map((item) => item.id),
        ok: false,
        error: message,
      }).catch(() => undefined);
      preview.push(previewRow(group.recipient, group.items, "send-failed", slackUserId));
      skipped += 1;
    }
  }

  return { dateKst, dryRun: opts.dryRun, weekend, preview, sent, skipped, errors };
}
