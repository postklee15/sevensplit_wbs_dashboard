import { isUnresolvedCs } from "./cs";
import { isNotionPageId, normalizeNotionId } from "./notionIds";
import { PatchError } from "./notionWrite";
import type { CsItem, CsSchema } from "./types";

export const DEFAULT_CS_DATABASE_ID = "2aa1559b-095a-8098-b648-f7e7769c49a2";

const TITLE_NAMES = ["이름", "제목", "문의", "문의 제목", "문의제목", "Name", "Title"];
const SERVICE_NAMES = ["서비스", "제품", "프로젝트", "Service"];
const STATUS_NAMES = ["상태", "Status"];
const DATE_NAMES = ["접수일", "문의일", "생성일", "등록일", "Date"];
const ASSIGNEE_NAMES = ["담당자", "담당", "Assignee"];
const WRITABLE_STATUS = new Set(["status", "select"]);

type NotionRichText = { plain_text?: string };
type NotionPerson = { id?: string; name?: string };
type NotionSelect = { name?: string } | null;
type NotionDate = { start?: string | null } | null;
type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  people?: NotionPerson[];
  select?: NotionSelect;
  multi_select?: NotionSelect[];
  status?: NotionSelect;
  date?: NotionDate;
  created_time?: string;
  formula?: { type?: string; string?: string | null };
};

type CsNotionPage = {
  id: string;
  url?: string;
  created_time?: string;
  properties?: Record<string, NotionProperty>;
  parent?: { type?: string; database_id?: string };
};

function plain(parts: NotionRichText[] | undefined): string {
  return (parts ?? []).map((part) => part.plain_text ?? "").join("").trim();
}

function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function pickProp(
  props: Record<string, NotionProperty>,
  names: string[],
): { name: string; prop: NotionProperty } | undefined {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(props, name)) {
      return { name, prop: props[name] };
    }
  }
  return undefined;
}

function firstOfType(
  props: Record<string, NotionProperty>,
  type: string,
): { name: string; prop: NotionProperty } | undefined {
  for (const [name, prop] of Object.entries(props)) {
    if (prop?.type === type) return { name, prop };
  }
  return undefined;
}

function selectName(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  const select = prop.select?.name?.trim();
  if (select) return select;
  const status = prop.status?.name?.trim();
  if (status) return status;
  const multi = (prop.multi_select ?? [])
    .map((item) => item?.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (multi.length) return multi[0] ?? null;
  const text = plain(prop.rich_text);
  if (text) return text;
  const title = plain(prop.title);
  if (title) return title;
  const formula = prop.formula?.string?.trim();
  return formula || null;
}

function peopleNames(prop: NotionProperty | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const person of prop?.people ?? []) {
    const name = person.name?.trim();
    if (!name || name === "(이름 없음)" || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function optionNames(prop: NotionProperty | { select?: { options?: Array<{ name?: string }> }; status?: { options?: Array<{ name?: string }> } }): string[] {
  const selectOpts = (prop as { select?: { options?: Array<{ name?: string }> } | NotionSelect }).select;
  const statusOpts = (prop as { status?: { options?: Array<{ name?: string }> } | NotionSelect }).status;
  const raw =
    (selectOpts && typeof selectOpts === "object" && "options" in selectOpts ? selectOpts.options : undefined) ??
    (statusOpts && typeof statusOpts === "object" && "options" in statusOpts ? statusOpts.options : undefined) ??
    [];
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

export function getCsDatabaseId(): string {
  return (process.env.NOTION_CS_DATABASE_ID || DEFAULT_CS_DATABASE_ID).trim();
}

export function getCsNotionConfig(): {
  token: string;
  databaseId: string;
  headers: {
    Authorization: string;
    "Notion-Version": string;
    "Content-Type": string;
  };
} {
  const token = process.env.NOTION_TOKEN;
  const databaseId = getCsDatabaseId();
  if (!token || !databaseId) {
    throw new Error("NOTION_TOKEN 또는 NOTION_CS_DATABASE_ID가 없습니다.");
  }
  return {
    token,
    databaseId,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  };
}

export function isCsDatabaseId(id: string | null | undefined): boolean {
  if (!id) return false;
  return normalizeNotionId(id) === normalizeNotionId(getCsDatabaseId());
}

function explainCsFetchError(status: number, body: string): string {
  if (status === 404 || body.includes("object_not_found")) {
    return "CS 노션 데이터베이스를 찾지 못했습니다. 인테그레이션을 해당 DB에 연결했는지 확인하세요.";
  }
  return `노션 CS 데이터베이스 조회 실패 (${status}): ${body.slice(0, 300)}`;
}

type DbJson = {
  title?: NotionRichText[];
  properties?: Record<string, unknown>;
};

export function buildCsSchema(properties: Record<string, unknown>): CsSchema {
  const status =
    pickProp(properties as Record<string, NotionProperty>, STATUS_NAMES) ??
    firstOfType(properties as Record<string, NotionProperty>, "status");
  const type = status?.prop.type ?? null;
  const writable = Boolean(type && WRITABLE_STATUS.has(type));
  return {
    statusProperty: status?.name ?? null,
    statusType: type,
    statusOptions: status ? optionNames(status.prop) : [],
    writable,
  };
}

export async function fetchCsDatabase(): Promise<{
  databaseTitle: string;
  properties: Record<string, unknown>;
  schema: CsSchema;
}> {
  const { databaseId, headers } = getCsNotionConfig();
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers,
    cache: "no-store",
  });
  if (!dbRes.ok) {
    const body = await dbRes.text();
    throw new Error(explainCsFetchError(dbRes.status, body));
  }
  const dbJson = (await dbRes.json()) as DbJson;
  const properties = dbJson.properties ?? {};
  return {
    databaseTitle: plain(dbJson.title) || "CS",
    properties,
    schema: buildCsSchema(properties),
  };
}

export function parseCsItem(page: CsNotionPage): CsItem | null {
  const props = page.properties ?? {};
  const titleProp = pickProp(props, TITLE_NAMES) ?? firstOfType(props, "title");
  const title = plain(titleProp?.prop.title) || selectName(titleProp?.prop) || "";
  const service = selectName(pickProp(props, SERVICE_NAMES)?.prop);
  const status = selectName(pickProp(props, STATUS_NAMES)?.prop ?? firstOfType(props, "status")?.prop);
  const dateProp =
    pickProp(props, DATE_NAMES)?.prop ??
    firstOfType(props, "date")?.prop ??
    firstOfType(props, "created_time")?.prop;
  const received = ymd(dateProp?.date?.start) ?? ymd(dateProp?.created_time) ?? ymd(page.created_time);
  return {
    id: page.id,
    title: title || "(제목 없음)",
    url: page.url ?? "",
    service,
    status,
    receivedAt: received,
    assignees: peopleNames(pickProp(props, ASSIGNEE_NAMES)?.prop),
  };
}

async function queryCsPages(): Promise<{ pages: CsNotionPage[]; databaseTitle: string; schema: CsSchema }> {
  const { databaseId, headers } = getCsNotionConfig();
  const { databaseTitle, schema } = await fetchCsDatabase();
  const pages: CsNotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(explainCsFetchError(res.status, body));
    }
    const json = (await res.json()) as {
      results?: CsNotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    pages.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
  } while (cursor);
  return { pages, databaseTitle, schema };
}

export async function fetchCsItems(): Promise<{
  databaseTitle: string;
  items: CsItem[];
  schema: CsSchema;
}> {
  const { pages, databaseTitle, schema } = await queryCsPages();
  const items = pages
    .map(parseCsItem)
    .filter((item): item is CsItem => Boolean(item));
  items.sort((a, b) => {
    const unresolvedDelta = Number(isUnresolvedCs(b.status)) - Number(isUnresolvedCs(a.status));
    if (unresolvedDelta !== 0) return unresolvedDelta;
    const dateA = a.receivedAt ?? "";
    const dateB = b.receivedAt ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.title.localeCompare(b.title, "ko");
  });
  return { databaseTitle, items, schema };
}

export async function fetchCsPage(pageId: string): Promise<{ item: CsItem; inDatabase: boolean }> {
  if (!isNotionPageId(pageId)) {
    throw new Error("페이지 ID가 올바르지 않습니다.");
  }
  const { headers } = getCsNotionConfig();
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error("노션 페이지를 찾지 못했습니다.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`노션 CS 페이지 조회 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  const page = (await res.json()) as CsNotionPage;
  const item = parseCsItem(page);
  if (!item) throw new Error("페이지를 읽지 못했습니다.");
  return {
    item,
    inDatabase: page.parent?.type === "database_id" && isCsDatabaseId(page.parent.database_id),
  };
}

export async function patchCsStatus(pageId: string, status: string, schema: CsSchema): Promise<CsItem> {
  if (!isNotionPageId(pageId)) {
    throw new PatchError("페이지 ID가 올바르지 않습니다.", 400);
  }
  const name = status.trim();
  if (!name) throw new PatchError("상태를 비울 수 없습니다.", 400);
  if (!schema.statusProperty || !schema.statusType) {
    throw new PatchError("노션에 상태 속성이 없습니다.", 400);
  }
  if (!schema.writable) {
    throw new PatchError("상태는 앱에서 수정할 수 없는 속성입니다.", 400);
  }
  if (schema.statusOptions.length > 0 && !schema.statusOptions.includes(name)) {
    throw new PatchError("상태 값이 노션 옵션에 없습니다.", 400);
  }
  const property =
    schema.statusType === "status" ? { status: { name } } : { select: { name } };
  const { headers } = getCsNotionConfig();
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      properties: { [schema.statusProperty]: property },
    }),
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
        ? "노션 인테그레이션에 이 CS 데이터베이스 편집 권한이 있는지 확인해 주세요."
        : body.slice(0, 300);
    throw new PatchError(`노션 저장 실패 (${res.status}): ${hint}`, 502);
  }
  const page = (await res.json()) as CsNotionPage;
  const item = parseCsItem(page);
  if (!item) throw new PatchError("저장 결과를 읽지 못했습니다.", 502);
  return item;
}
