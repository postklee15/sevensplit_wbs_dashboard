import type { Task } from "./types";

type NotionRichText = { plain_text?: string };
type NotionPerson = { name?: string };
type NotionSelect = { name?: string } | null;
type NotionDate = { start?: string | null; end?: string | null } | null;
type NotionRelation = { id: string };

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

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
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
  const formula = prop.formula?.string?.trim();
  return formula || null;
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

export function parseTask(page: NotionPage): ParsedTask | null {
  const props = page.properties ?? {};
  const title = plain(props["작업명"]?.title);
  const childIds = (props["하위 항목"]?.relation ?? []).map((rel) => rel.id);
  const parentIds = (props["상위 항목"]?.relation ?? []).map((rel) => rel.id);

  return {
    id: page.id,
    title,
    url: page.url ?? "",
    ancestorTitles: [],
    assignees: (props["담당자"]?.people ?? [])
      .map((person) => person.name?.trim())
      .filter((name): name is string => Boolean(name)),
    service: props["서비스"]?.select?.name?.trim() || null,
    attribute: attributeValue(props["업무 속성"]),
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

function ownService(task: { service: string | null } | undefined): string | null {
  const name = task?.service?.trim();
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
    service: inheritedServiceOf(task.id),
  }));
}

export async function fetchWbsTasks(): Promise<{
  databaseTitle: string;
  tasks: Task[];
}> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token || !databaseId) {
    throw new Error("NOTION_TOKEN 또는 NOTION_DATABASE_ID가 없습니다.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

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

  return { databaseTitle, tasks: withTreeFields(parsed) };
}
