import type { AssigneePerson, Task } from "./types";

type NotionRichText = { plain_text?: string };
type NotionPerson = { id?: string; name?: string };
type NotionSelect = { name?: string } | null;
type NotionDate = { start?: string | null; end?: string | null } | null;
type NotionRelation = { id: string };

export type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
  parent?: { type?: string; database_id?: string };
};

export function getNotionConfig(): {
  token: string;
  databaseId: string;
  headers: {
    Authorization: string;
    "Notion-Version": string;
    "Content-Type": string;
  };
} {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token || !databaseId) {
    throw new Error("NOTION_TOKEN 또는 NOTION_DATABASE_ID가 없습니다.");
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

export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export function isWbsDatabaseId(id: string | null | undefined): boolean {
  if (!id) return false;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) return false;
  return normalizeNotionId(id) === normalizeNotionId(databaseId);
}

export function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(normalizeNotionId(id));
}

type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  people?: NotionPerson[];
  select?: NotionSelect;
  multi_select?: NotionSelect[];
  status?: NotionSelect;
  number?: number | null;
  formula?: { type?: string; number?: number | null; string?: string | null };
  date?: NotionDate;
  url?: string | null;
  relation?: NotionRelation[];
};

function plain(parts: NotionRichText[] | undefined): string {
  return (parts ?? []).map((part) => part.plain_text ?? "").join("").trim();
}

function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function numberValue(prop: NotionProperty | undefined): number | null {
  if (prop?.number != null && Number.isFinite(prop.number)) return prop.number;
  if (prop?.formula?.number != null && Number.isFinite(prop.formula.number)) {
    return prop.formula.number;
  }
  return null;
}

function attributeValue(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  const select = prop.select?.name?.trim();
  if (select) return select;
  const status = prop.status?.name?.trim();
  if (status) return status;
  const multi = (prop.multi_select ?? [])
    .map((item) => item?.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (multi.length) return multi.join(", ");
  const text = plain(prop.rich_text);
  if (text) return text;
  const title = plain(prop.title);
  if (title) return title;
  const formula = prop.formula?.string?.trim();
  return formula || null;
}

function displayValue(prop: NotionProperty | undefined): string | null {
  const text = attributeValue(prop);
  if (text) return text;
  const n = numberValue(prop);
  return n == null ? null : String(n);
}

function extraDaysValue(prop: NotionProperty | undefined): number | null {
  const n = numberValue(prop);
  if (n != null) return n;
  const text = attributeValue(prop);
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickProp(
  props: Record<string, NotionProperty>,
  names: string[],
): NotionProperty | undefined {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(props, name)) return props[name];
  }
  return undefined;
}

type ParsedTask = Task & { childIds: string[]; parentIds: string[] };

function peopleOf(prop: NotionProperty | undefined): AssigneePerson[] {
  const seen = new Set<string>();
  const people: AssigneePerson[] = [];
  for (const person of prop?.people ?? []) {
    const id = person.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    people.push({
      id,
      name: person.name?.trim() || "(이름 없음)",
    });
  }
  return people;
}

export function parseTask(page: NotionPage): ParsedTask | null {
  const props = page.properties ?? {};
  const title = plain(props["작업명"]?.title);
  const childIds = (props["하위 항목"]?.relation ?? []).map((rel) => rel.id);
  const parentIds = (props["상위 항목"]?.relation ?? []).map((rel) => rel.id);
  const assigneePeople = peopleOf(props["담당자"]);
  const own = props["서비스"]?.select?.name?.trim() || null;

  return {
    id: page.id,
    title,
    url: page.url ?? "",
    ancestorTitles: [],
    assignees: assigneePeople
      .map((person) => person.name.trim())
      .filter((name) => name && name !== "(이름 없음)"),
    assigneePeople,
    ownService: own,
    service: own,
    attribute: displayValue(pickProp(props, ["업무속성", "업무 속성"])),
    importance: displayValue(pickProp(props, ["중요도"])),
    progress: numberValue(props["진척도"]),
    allocation: numberValue(props["투입률"]),
    effortDays: numberValue(props["소요일"]),
    extraDays: extraDaysValue(pickProp(props, ["추가일정", "추가 일정"])),
    start: ymd(props["일정"]?.date?.start),
    end: ymd(props["일정"]?.date?.end) ?? ymd(props["일정"]?.date?.start),
    scheduleApproval: props["일정승인"]?.select?.name ?? null,
    deployApproval: props["배포승인"]?.select?.name ?? null,
    issue: plain(props["내용/이슈"]?.rich_text),
    delayReason: attributeValue(pickProp(props, ["지연사유", "지연 사유"])),
    isLeaf: childIds.length === 0,
    childIds,
    parentIds,
  };
}

function ownService(task: { ownService?: string | null; service: string | null } | undefined): string | null {
  const name = task?.ownService?.trim() || task?.service?.trim();
  return name || null;
}

function withTreeFields(tasks: ParsedTask[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const parentOf = new Map<string, string>();

  for (const task of tasks) {
    for (const childId of task.childIds) {
      parentOf.set(childId, task.id);
    }
  }
  for (const task of tasks) {
    const parentId = task.parentIds[0];
    if (parentId && !parentOf.has(task.id)) {
      parentOf.set(task.id, parentId);
    }
  }

  function ancestorTitlesOf(id: string): string[] {
    const titles: string[] = [];
    const seen = new Set<string>();
    let cursor = parentOf.get(id);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = byId.get(cursor);
      if (parent?.title) titles.push(parent.title);
      cursor = parentOf.get(cursor);
    }
    return titles.reverse();
  }

  function inheritedServiceOf(id: string): string | null {
    const own = ownService(byId.get(id));
    if (own) return own;
    const seen = new Set<string>([id]);
    let cursor = parentOf.get(id);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const fromParent = ownService(byId.get(cursor));
      if (fromParent) return fromParent;
      cursor = parentOf.get(cursor);
    }
    return null;
  }

  return tasks.map(({ childIds: _childIds, parentIds: _parentIds, ...task }) => ({
    ...task,
    ancestorTitles: ancestorTitlesOf(task.id),
    ownService: ownService(task),
    service: inheritedServiceOf(task.id),
  }));
}

export async function fetchWbsTasks(): Promise<{
  databaseTitle: string;
  tasks: Task[];
  properties: Record<string, unknown>;
}> {
  const { databaseId, headers } = getNotionConfig();

  const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers,
    cache: "no-store",
  });
  if (!dbRes.ok) {
    const body = await dbRes.text();
    throw new Error(`노션 데이터베이스 조회 실패 (${dbRes.status}): ${body.slice(0, 300)}`);
  }
  const dbJson = (await dbRes.json()) as {
    title?: NotionRichText[];
    properties?: Record<string, unknown>;
  };
  const databaseTitle = plain(dbJson.title) || "WBS & Gantt";

  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`노션 행 조회 실패 (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    pages.push(...(json.results ?? []));
    cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
  } while (cursor);

  const parsed = pages
    .map(parseTask)
    .filter((task): task is ParsedTask => Boolean(task && task.title));

  return {
    databaseTitle,
    tasks: withTreeFields(parsed),
    properties: dbJson.properties ?? {},
  };
}

export async function fetchWbsDatabase(): Promise<{
  databaseTitle: string;
  properties: Record<string, unknown>;
}> {
  const { databaseId, headers } = getNotionConfig();
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers,
    cache: "no-store",
  });
  if (!dbRes.ok) {
    const body = await dbRes.text();
    throw new Error(`노션 데이터베이스 조회 실패 (${dbRes.status}): ${body.slice(0, 300)}`);
  }
  const dbJson = (await dbRes.json()) as {
    title?: NotionRichText[];
    properties?: Record<string, unknown>;
  };
  return {
    databaseTitle: plain(dbJson.title) || "WBS & Gantt",
    properties: dbJson.properties ?? {},
  };
}

export async function fetchNotionUsers(): Promise<AssigneePerson[]> {
  const { headers } = getNotionConfig();
  const people: AssigneePerson[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  try {
    do {
      const url = new URL("https://api.notion.com/v1/users");
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("start_cursor", cursor);
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) break;
      const json = (await res.json()) as {
        results?: Array<{ id?: string; name?: string; type?: string }>;
        has_more?: boolean;
        next_cursor?: string | null;
      };
      for (const user of json.results ?? []) {
        if (!user.id || user.type === "bot" || seen.has(user.id)) continue;
        seen.add(user.id);
        people.push({
          id: user.id,
          name: user.name?.trim() || "(이름 없음)",
        });
      }
      cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
    } while (cursor);
  } catch {
    return people;
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function fetchWbsPage(pageId: string): Promise<{
  task: Task;
  inDatabase: boolean;
}> {
  if (!isNotionPageId(pageId)) {
    throw new Error("페이지 ID가 올바르지 않습니다.");
  }
  const { headers } = getNotionConfig();
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error("노션 페이지를 찾지 못했습니다.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`노션 페이지 조회 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  const page = (await res.json()) as NotionPage;
  const parsed = parseTask(page);
  if (!parsed) {
    throw new Error("페이지를 읽지 못했습니다.");
  }
  const { childIds: _childIds, parentIds: _parentIds, ...task } = parsed;
  return {
    task: {
      ...task,
      ownService: task.ownService ?? task.service,
    },
    inDatabase: page.parent?.type === "database_id" && isWbsDatabaseId(page.parent.database_id),
  };
}
