import { extraScheduleDays } from "./metrics";
import { normalizeNotionId } from "./notionIds";
import { descendantTasks } from "./taskTree";
import { PatchError, patchWbsPage } from "./notionWrite";
import type { Task, TaskPatch, WbsFieldKey, WbsSchema } from "./types";

const PATCH_CONCURRENCY = 2;

export function rootLooksDelayed(task: Task): boolean {
  if (task.scheduleApproval?.trim() === "지연") return true;
  if (extraScheduleDays(task) > 0) return true;
  return Boolean(task.delayReason?.trim());
}

function writable(schema: WbsSchema, key: WbsFieldKey): boolean {
  return Boolean(schema.fields[key]?.writable);
}

export function childDelayPatch(root: Task, schema: WbsSchema): TaskPatch {
  const patch: TaskPatch = {};
  const extra = extraScheduleDays(root);
  if (writable(schema, "extraDays") && extra > 0) {
    patch.extraDays = extra;
  }
  const reason = root.delayReason?.trim() ?? "";
  if (writable(schema, "delayReason") && reason) {
    patch.delayReason = root.delayReason;
  }
  if (writable(schema, "scheduleApproval") && root.scheduleApproval?.trim() === "지연") {
    patch.scheduleApproval = "지연";
  }
  return patch;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ ok: number; failed: number }> {
  let cursor = 0;
  let ok = 0;
  let failed = 0;
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => run()));
  return { ok, failed };
}

export async function cascadeDelayToDescendants(opts: {
  rootId: string;
  root: Task;
  tasks: Task[];
  schema: WbsSchema;
}): Promise<{ cascaded: number; cascadeFailed: number }> {
  const patch = childDelayPatch(opts.root, opts.schema);
  if (Object.keys(patch).length === 0) {
    return { cascaded: 0, cascadeFailed: 0 };
  }
  const descendants = descendantTasks(opts.rootId, opts.tasks).filter(
    (task) => normalizeNotionId(task.id) !== normalizeNotionId(opts.rootId),
  );
  if (descendants.length === 0) {
    return { cascaded: 0, cascadeFailed: 0 };
  }
  const result = await mapPool(descendants, PATCH_CONCURRENCY, async (child) => {
    await patchWbsPage(child.id, patch, opts.schema, child);
  });
  return { cascaded: result.ok, cascadeFailed: result.failed };
}

export function assertCanCascadeDelay(rootId: string, tasks: Task[]): void {
  const key = normalizeNotionId(rootId);
  const self = tasks.find((task) => normalizeNotionId(task.id) === key);
  if (!self) {
    throw new PatchError("작업 트리에서 이 페이지를 찾지 못했습니다.", 404);
  }
  if (self.parentId) {
    throw new PatchError("최상위 작업만 하위에 지연을 일괄 적용할 수 있습니다.", 400);
  }
}
