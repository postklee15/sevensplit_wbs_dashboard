import type {
  AssigneePerson,
  Task,
  TaskPatch,
  WbsFieldKey,
  WbsFieldSchema,
  WbsSchema,
} from "./types";
import {
  fetchNotionUsers,
  fetchWbsDatabase,
  getNotionConfig,
  isNotionPageId,
  parseTask,
} from "./notion";

export const WBS_FIELD_ALIASES: Record<WbsFieldKey, string[]> = {
  title: ["작업명"],
  service: ["서비스"],
  attribute: ["업무속성", "업무 속성"],
  importance: ["중요도"],
  assignees: ["담당자"],
  schedule: ["일정"],
  extraDays: ["추가일정", "추가 일정"],
  scheduleApproval: ["일정승인"],
  deployApproval: ["배포승인"],
  progress: ["진척도"],
  allocation: ["투입률"],
  effortDays: ["소요일"],
  delayReason: ["지연사유", "지연 사유"],
  issue: ["내용/이슈"],
};

const WRITABLE_TYPES = new Set([
  "title",
  "select",
  "multi_select",
  "status",
  "people",
  "date",
  "number",
  "rich_text",
]);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const RICH_TEXT_LIMIT = 2000;

export class PatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type DbProperty = {
  type?: string;
  select?: { options?: Array<{ name?: string }> };
  multi_select?: { options?: Array<{ name?: string }> };
  status?: { options?: Array<{ name?: string }> };
  number?: { format?: string };
};

function hasKey<K extends keyof TaskPatch>(patch: TaskPatch, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function optionNames(prop: DbProperty): string[] {
  const raw =
    prop.select?.options ?? prop.multi_select?.options ?? prop.status?.options ?? [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const option of raw) {
    const name = option?.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function fieldFromProperties(
  properties: Record<string, unknown>,
  names: string[],
): WbsFieldSchema | undefined {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(properties, name)) continue;
    const prop = properties[name] as DbProperty;
    const type = prop?.type ?? "";
    if (!type) continue;
    return {
      property: name,
      type,
      options: optionNames(prop),
      writable: WRITABLE_TYPES.has(type),
      numberFormat: prop.number?.format ?? null,
    };
  }
  return undefined;
}

export function mergePeople(...lists: AssigneePerson[][]): AssigneePerson[] {
  const seen = new Set<string>();
  const people: AssigneePerson[] = [];
  for (const list of lists) {
    for (const person of list) {
      if (!person.id || seen.has(person.id)) continue;
      seen.add(person.id);
      people.push({
        id: person.id,
        name: person.name.trim() || "(이름 없음)",
      });
    }
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function buildWbsSchema(
  properties: Record<string, unknown>,
  people: AssigneePerson[],
): WbsSchema {
  const fields: WbsSchema["fields"] = {};
  (Object.keys(WBS_FIELD_ALIASES) as WbsFieldKey[]).forEach((key) => {
    const field = fieldFromProperties(properties, WBS_FIELD_ALIASES[key]);
    if (field) fields[key] = field;
  });
  return { fields, people };
}

export async function fetchWbsSchema(extraPeople: AssigneePerson[] = []): Promise<WbsSchema> {
  const { properties } = await fetchWbsDatabase();
  const users = await fetchNotionUsers();
  return buildWbsSchema(properties, mergePeople(users, extraPeople));
}

function requireField(schema: WbsSchema, key: WbsFieldKey, label: string): WbsFieldSchema {
  const field = schema.fields[key];
  if (!field) {
    throw new PatchError(`노션에 ${label} 속성이 없습니다.`, 400);
  }
  if (!field.writable) {
    throw new PatchError(`${label}은(는) 앱에서 수정할 수 없는 속성입니다.`, 400);
  }
  return field;
}

function assertOption(field: WbsFieldSchema, value: string, label: string) {
  if (field.options.length === 0) return;
  if (field.options.includes(value)) return;
  throw new PatchError(`${label} 값이 노션 옵션에 없습니다.`, 400);
}

function asNumber(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PatchError(`${label}은(는) 숫자여야 합니다.`, 400);
  }
  return value;
}

function asString(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new PatchError(`${label}은(는) 문자열이어야 합니다.`, 400);
  }
  return value;
}

function asYmd(value: string | null, label: string): string | null {
  if (value == null || value.trim() === "") return null;
  const ymd = value.trim().slice(0, 10);
  if (!YMD.test(ymd)) {
    throw new PatchError(`${label} 날짜 형식이 올바르지 않습니다.`, 400);
  }
  return ymd;
}

function richText(value: string): Array<{ type: "text"; text: { content: string } }> {
  if (!value) return [];
  if (value.length > RICH_TEXT_LIMIT) {
    throw new PatchError(`텍스트는 ${RICH_TEXT_LIMIT}자를 넘을 수 없습니다.`, 400);
  }
  return [{ type: "text", text: { content: value } }];
}

function splitMulti(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function writePercent(
  ui: number,
  format: string | null,
  current: number | null,
): number {
  if (format === "percent") return ui / 100;
  if (format) return ui;
  if (current != null && current <= 1) return ui / 100;
  return ui;
}

function selectValue(
  field: WbsFieldSchema,
  value: string | null,
  label: string,
): Record<string, unknown> {
  if (!value) {
    if (field.type === "status") {
      throw new PatchError(`${label}은(는) 비울 수 없습니다.`, 400);
    }
    if (field.type === "multi_select") return { multi_select: [] };
    if (field.type === "rich_text") return { rich_text: [] };
    if (field.type === "number") return { number: null };
    return { select: null };
  }
  if (field.type === "rich_text") return { rich_text: richText(value) };
  if (field.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new PatchError(`${label}은(는) 숫자여야 합니다.`, 400);
    return { number: n };
  }
  if (field.type === "multi_select") {
    const names = splitMulti(value);
    for (const name of names) assertOption(field, name, label);
    return { multi_select: names.map((name) => ({ name })) };
  }
  assertOption(field, value, label);
  if (field.type === "status") return { status: { name: value } };
  return { select: { name: value } };
}

function buildProperties(
  patch: TaskPatch,
  schema: WbsSchema,
  current: Task,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  if (hasKey(patch, "title")) {
    const field = requireField(schema, "title", "작업명");
    const title = asString(patch.title, "작업명")?.trim() ?? "";
    if (!title) throw new PatchError("작업명을 비울 수 없습니다.", 400);
    properties[field.property] = { title: richText(title) };
  }

  if (hasKey(patch, "service")) {
    const field = requireField(schema, "service", "서비스");
    const value = asString(patch.service, "서비스")?.trim() || null;
    Object.assign(properties, {
      [field.property]: selectValue(field, value, "서비스"),
    });
  }

  if (hasKey(patch, "attribute")) {
    const field = requireField(schema, "attribute", "업무속성");
    const value = asString(patch.attribute, "업무속성")?.trim() || null;
    Object.assign(properties, {
      [field.property]: selectValue(field, value, "업무속성"),
    });
  }

  if (hasKey(patch, "importance")) {
    const field = requireField(schema, "importance", "중요도");
    const value = asString(patch.importance, "중요도")?.trim() || null;
    Object.assign(properties, {
      [field.property]: selectValue(field, value, "중요도"),
    });
  }

  if (hasKey(patch, "assigneeIds")) {
    const field = requireField(schema, "assignees", "담당자");
    if (field.type !== "people") {
      throw new PatchError("담당자는 사람 속성이어야 합니다.", 400);
    }
    if (!Array.isArray(patch.assigneeIds)) {
      throw new PatchError("담당자는 ID 목록이어야 합니다.", 400);
    }
    const ids = patch.assigneeIds.map((id) => String(id).trim()).filter(Boolean);
    const allowed = new Set(schema.people.map((person) => person.id));
    for (const id of current.assigneePeople) allowed.add(id.id);
    if (allowed.size > 0) {
      for (const id of ids) {
        if (!allowed.has(id)) {
          throw new PatchError("담당자에 없는 사용자를 넣을 수 없습니다.", 400);
        }
      }
    }
    properties[field.property] = { people: ids.map((id) => ({ id })) };
  }

  if (hasKey(patch, "start") || hasKey(patch, "end")) {
    const field = requireField(schema, "schedule", "일정");
    if (field.type !== "date") {
      throw new PatchError("일정은 날짜 속성이어야 합니다.", 400);
    }
    const start = asYmd(asString(patch.start ?? null, "시작일"), "시작일");
    const end = asYmd(asString(patch.end ?? null, "종료일"), "종료일");
    if (!start && end) {
      throw new PatchError("종료일만 있고 시작일이 없습니다.", 400);
    }
    if (start && end && end < start) {
      throw new PatchError("종료일이 시작일보다 앞입니다.", 400);
    }
    properties[field.property] = start ? { date: { start, end: end && end !== start ? end : null } } : { date: null };
  }

  if (hasKey(patch, "extraDays")) {
    const field = requireField(schema, "extraDays", "추가 일정");
    const n = asNumber(patch.extraDays, "추가 일정");
    if (n != null && (n < 0 || !Number.isFinite(n))) {
      throw new PatchError("추가 일정은 0 이상이어야 합니다.", 400);
    }
    if (field.type === "number") {
      properties[field.property] = { number: n == null ? null : Math.floor(n) };
    } else if (field.type === "rich_text") {
      properties[field.property] = { rich_text: n == null ? [] : richText(String(Math.floor(n))) };
    } else {
      throw new PatchError("추가 일정은 숫자 속성이어야 합니다.", 400);
    }
  }

  if (hasKey(patch, "scheduleApproval")) {
    const field = requireField(schema, "scheduleApproval", "일정승인");
    const raw = asString(patch.scheduleApproval, "일정승인")?.trim() || null;
    const value = raw === "미지정" ? null : raw;
    Object.assign(properties, {
      [field.property]: selectValue(field, value, "일정승인"),
    });
  }

  if (hasKey(patch, "deployApproval")) {
    const field = requireField(schema, "deployApproval", "배포승인");
    const value = asString(patch.deployApproval, "배포승인")?.trim() || null;
    Object.assign(properties, {
      [field.property]: selectValue(field, value, "배포승인"),
    });
  }

  if (hasKey(patch, "progress")) {
    const field = requireField(schema, "progress", "진척");
    const n = asNumber(patch.progress, "진척");
    if (n != null && (n < 0 || n > 100)) {
      throw new PatchError("진척은 0–100이어야 합니다.", 400);
    }
    if (field.type !== "number") {
      throw new PatchError("진척은 숫자 속성이어야 합니다.", 400);
    }
    properties[field.property] = {
      number: n == null ? null : writePercent(n, field.numberFormat, current.progress),
    };
  }

  if (hasKey(patch, "allocation")) {
    const field = requireField(schema, "allocation", "투입률");
    const n = asNumber(patch.allocation, "투입률");
    if (n != null && (n < 0 || n > 100)) {
      throw new PatchError("투입률은 0–100이어야 합니다.", 400);
    }
    if (field.type !== "number") {
      throw new PatchError("투입률은 숫자 속성이어야 합니다.", 400);
    }
    properties[field.property] = {
      number: n == null ? null : writePercent(n, field.numberFormat, current.allocation),
    };
  }

  if (hasKey(patch, "effortDays")) {
    const field = requireField(schema, "effortDays", "소요일");
    const n = asNumber(patch.effortDays, "소요일");
    if (n != null && n < 0) {
      throw new PatchError("소요일은 0 이상이어야 합니다.", 400);
    }
    if (field.type !== "number") {
      throw new PatchError("소요일은 숫자 속성이어야 합니다.", 400);
    }
    properties[field.property] = { number: n };
  }

  if (hasKey(patch, "delayReason")) {
    const field = requireField(schema, "delayReason", "지연사유");
    const value = asString(patch.delayReason, "지연사유");
    if (field.type === "rich_text") {
      properties[field.property] = { rich_text: richText(value?.trim() ?? "") };
    } else {
      Object.assign(properties, {
        [field.property]: selectValue(field, value?.trim() || null, "지연사유"),
      });
    }
  }

  if (hasKey(patch, "issue")) {
    const field = requireField(schema, "issue", "내용/이슈");
    const value = asString(patch.issue, "내용/이슈") ?? "";
    if (field.type !== "rich_text") {
      throw new PatchError("내용/이슈는 텍스트 속성이어야 합니다.", 400);
    }
    properties[field.property] = { rich_text: richText(value) };
  }

  return properties;
}

export async function patchWbsPage(
  pageId: string,
  patch: TaskPatch,
  schema: WbsSchema,
  current: Task,
): Promise<Task> {
  if (!isNotionPageId(pageId)) {
    throw new PatchError("페이지 ID가 올바르지 않습니다.", 400);
  }
  const properties = buildProperties(patch, schema, current);
  if (Object.keys(properties).length === 0) {
    throw new PatchError("바꿀 항목이 없습니다.", 400);
  }
  const { headers } = getNotionConfig();
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ properties }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400) {
      throw new PatchError(`노션이 값을 거절했습니다: ${body.slice(0, 300)}`, 400);
    }
    if (res.status === 404) {
      throw new PatchError("노션 페이지를 찾지 못했습니다.", 404);
    }
    const hint =
      res.status === 401 || res.status === 403
        ? "노션 인테그레이션에 이 데이터베이스 편집 권한이 있는지 확인해 주세요."
        : body.slice(0, 300);
    throw new PatchError(`노션 저장 실패 (${res.status}): ${hint}`, 502);
  }
  const page = (await res.json()) as Parameters<typeof parseTask>[0];
  const parsed = parseTask(page);
  if (!parsed) throw new PatchError("저장 결과를 읽지 못했습니다.", 502);
  const { childIds: _c, parentIds: _p, ...next } = parsed;
  return {
    ...next,
    ancestorTitles: current.ancestorTitles,
    service: next.ownService || current.service,
  };
}
