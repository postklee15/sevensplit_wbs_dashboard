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
  number?: number | null;
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

export function parseTask(page: NotionPage): Task | null {
  const props = page.properties ?? {};
  const title = plain(props["작업명"]?.title);
  const childCount = props["하위 항목"]?.relation?.length ?? 0;

  return {
    id: page.id,
    title,
    url: page.url ?? "",
    assignees: (props["담당자"]?.people ?? [])
      .map((person) => person.name?.trim())
      .filter((name): name is string => Boolean(name)),
    service: props["서비스"]?.select?.name ?? null,
    progress: props["진척도"]?.number ?? null,
    effortDays: props["소요일"]?.number ?? null,
    start: ymd(props["일정"]?.date?.start),
    end: ymd(props["일정"]?.date?.end) ?? ymd(props["일정"]?.date?.start),
    scheduleApproval: props["일정승인"]?.select?.name ?? null,
    deployApproval: props["배포승인"]?.select?.name ?? null,
    issue: plain(props["내용/이슈"]?.rich_text),
    isLeaf: childCount === 0,
  };
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

  const tasks = pages
    .map(parseTask)
    .filter((task): task is Task => Boolean(task && task.title));

  return { databaseTitle, tasks };
}
