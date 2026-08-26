import { normalizeNotionId } from "./notionIds";
import { isRootTask } from "./taskTree";
import type { Task } from "./types";

export type TaskFamily = {
  key: string;
  rootTitle: string;
  root: Task | null;
  tasks: Task[];
  /** 최상위 행이 목록에 없을 때 그룹 제목 줄을 그린다. */
  showLabel: boolean;
};

export type TaskCompare = (a: Task, b: Task) => number;

export function sameTaskId(a: string, b: string): boolean {
  return normalizeNotionId(a) === normalizeNotionId(b);
}

export function treeDepthOf(task: Pick<Task, "parentId" | "ancestorTitles">): number {
  const n = task.ancestorTitles?.length ?? 0;
  if (n > 0) return n;
  return task.parentId ? 1 : 0;
}

function indexById(tasks: Task[]): Map<string, Task> {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    byId.set(normalizeNotionId(task.id), task);
  }
  return byId;
}

function walkUp(task: Task, byId: Map<string, Task>): Task {
  const seen = new Set<string>();
  let cursor = task;
  while (cursor.parentId) {
    const key = normalizeNotionId(cursor.id);
    if (seen.has(key)) break;
    seen.add(key);
    const parent = byId.get(normalizeNotionId(cursor.parentId));
    if (!parent) break;
    cursor = parent;
  }
  return cursor;
}

function resolveRoot(
  task: Task,
  byId: Map<string, Task>,
): { key: string; title: string; root: Task | null } {
  const top = walkUp(task, byId);
  if (isRootTask(top)) {
    return { key: normalizeNotionId(top.id), title: top.title, root: top };
  }
  const name = task.ancestorTitles[0] ?? top.ancestorTitles[0];
  if (name) {
    for (const candidate of byId.values()) {
      if (isRootTask(candidate) && candidate.title === name) {
        return { key: normalizeNotionId(candidate.id), title: candidate.title, root: candidate };
      }
    }
    return { key: `title:${name}`, title: name, root: null };
  }
  return { key: normalizeNotionId(top.id), title: top.title, root: null };
}

function orderInFamily(tasks: Task[], compare: TaskCompare): Task[] {
  const ids = new Set(tasks.map((task) => normalizeNotionId(task.id)));
  const byParent = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const parentKey =
      task.parentId && ids.has(normalizeNotionId(task.parentId))
        ? normalizeNotionId(task.parentId)
        : null;
    const list = byParent.get(parentKey) ?? [];
    list.push(task);
    byParent.set(parentKey, list);
  }
  const siblingCompare: TaskCompare = (a, b) => {
    const rootRank = (isRootTask(a) ? 0 : 1) - (isRootTask(b) ? 0 : 1);
    if (rootRank !== 0) return rootRank;
    return compare(a, b);
  };
  for (const list of byParent.values()) {
    list.sort(siblingCompare);
  }
  const out: Task[] = [];
  const visit = (parentKey: string | null) => {
    for (const child of byParent.get(parentKey) ?? []) {
      out.push(child);
      visit(normalizeNotionId(child.id));
    }
  };
  visit(null);
  return out;
}

export function groupTasksByRoot(
  visible: Task[],
  catalog: Task[],
  compare: TaskCompare,
): TaskFamily[] {
  const byId = indexById(catalog.length ? catalog : visible);
  const buckets = new Map<string, { title: string; root: Task | null; tasks: Task[] }>();
  for (const task of visible) {
    const resolved = resolveRoot(task, byId);
    const bucket = buckets.get(resolved.key) ?? {
      title: resolved.title,
      root: resolved.root,
      tasks: [],
    };
    if (!bucket.root && resolved.root) bucket.root = resolved.root;
    if (!bucket.title) bucket.title = resolved.title;
    bucket.tasks.push(task);
    buckets.set(resolved.key, bucket);
  }

  const families: TaskFamily[] = [];
  for (const [key, bucket] of buckets) {
    const tasks = orderInFamily(bucket.tasks, compare);
    const rootInList = Boolean(
      bucket.root && tasks.some((task) => sameTaskId(task.id, bucket.root!.id)),
    );
    families.push({
      key,
      rootTitle: bucket.title,
      root: bucket.root,
      tasks,
      showLabel: !rootInList && Boolean(bucket.title) && !tasks.every((task) => isRootTask(task)),
    });
  }

  families.sort((a, b) => {
    const leadA = a.tasks[0];
    const leadB = b.tasks[0];
    if (!leadA || !leadB) return a.rootTitle.localeCompare(b.rootTitle, "ko");
    const byLead = compare(leadA, leadB);
    if (byLead !== 0) return byLead;
    return a.rootTitle.localeCompare(b.rootTitle, "ko");
  });
  return families;
}
