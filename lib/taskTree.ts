import { normalizeNotionId } from "./notionIds";
import type { Task } from "./types";

export function isRootTask(task: Pick<Task, "parentId" | "ancestorTitles">): boolean {
  if (task.parentId) return false;
  return (task.ancestorTitles?.length ?? 0) === 0;
}

export function descendantTasks(rootId: string, tasks: Task[]): Task[] {
  const rootKey = normalizeNotionId(rootId);
  const childrenOf = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const key = normalizeNotionId(task.parentId);
    const list = childrenOf.get(key) ?? [];
    list.push(task);
    childrenOf.set(key, list);
  }
  const out: Task[] = [];
  const seen = new Set<string>();
  const stack = [...(childrenOf.get(rootKey) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    const key = normalizeNotionId(node.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(node);
    const nested = childrenOf.get(key);
    if (nested?.length) stack.push(...nested);
  }
  return out;
}
