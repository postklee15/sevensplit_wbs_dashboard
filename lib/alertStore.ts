import { boolField, getDocument, listDocuments, patchDocument, strField } from "./firestoreRest";

const PM_COLLECTION = "projectPms";
const LOG_COLLECTION = "alertLogs";

export type ProjectPm = {
  service: string;
  pmUid: string;
};

export type AlertKind = "unassigned" | "overdue";

export function serviceDocId(service: string): string {
  return Buffer.from(service, "utf8").toString("base64url");
}

export function alertLogId(kind: AlertKind, uid: string, dateKst: string): string {
  return `${kind}_${uid}_${dateKst}`;
}

export async function listProjectPms(token: string): Promise<ProjectPm[]> {
  const docs = await listDocuments(token, PM_COLLECTION);
  return docs
    .map((doc) => ({
      service: strField(doc.fields, "service").trim(),
      pmUid: strField(doc.fields, "pmUid").trim(),
    }))
    .filter((row) => Boolean(row.service));
}

export async function upsertProjectPm(
  token: string,
  row: ProjectPm,
  actorEmail: string,
): Promise<ProjectPm> {
  const service = row.service.trim();
  if (!service) throw new Error("서비스 이름이 필요합니다.");
  const pmUid = row.pmUid.trim();
  await patchDocument(
    token,
    PM_COLLECTION,
    serviceDocId(service),
    {
      service,
      pmUid,
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    },
    ["service", "pmUid", "updatedAt", "updatedBy"],
  );
  return { service, pmUid };
}

export async function alertAlreadySent(
  token: string,
  kind: AlertKind,
  uid: string,
  dateKst: string,
): Promise<boolean> {
  const doc = await getDocument(token, LOG_COLLECTION, alertLogId(kind, uid, dateKst));
  if (!doc) return false;
  return boolField(doc.fields, "ok", false);
}

export async function writeAlertLog(
  token: string,
  entry: {
    kind: AlertKind;
    recipientUid: string;
    dateKst: string;
    taskIds: string[];
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  await patchDocument(
    token,
    LOG_COLLECTION,
    alertLogId(entry.kind, entry.recipientUid, entry.dateKst),
    {
      kind: entry.kind,
      recipientUid: entry.recipientUid,
      dateKst: entry.dateKst,
      taskIds: entry.taskIds.join(","),
      sentAt: new Date().toISOString(),
      ok: entry.ok,
      error: entry.error ?? "",
    },
    ["kind", "recipientUid", "dateKst", "taskIds", "sentAt", "ok", "error"],
  );
}
