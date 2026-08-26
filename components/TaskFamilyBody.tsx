"use client";

import type { ReactNode } from "react";
import { RootBadge } from "@/components/RootBadge";
import { useTaskDetail } from "@/components/TaskDetail";
import { sameTaskId, type TaskFamily } from "@/lib/taskGroups";
import type { Task } from "@/lib/types";

export type TaskFamilyRowMeta = {
  inFamily: boolean;
  isFamilyRoot: boolean;
};

export function TaskFamilyBody({
  families,
  colCount,
  renderRow,
}: {
  families: TaskFamily[];
  colCount: number;
  renderRow: (task: Task, meta: TaskFamilyRowMeta) => ReactNode;
}) {
  const { open } = useTaskDetail();
  return (
    <>
      {families.map((family) => {
        const inFamily = family.tasks.length > 1 || family.showLabel;
        return (
          <tbody key={family.key} className={inFamily ? "task-family" : undefined}>
            {family.showLabel ? (
              <tr className="task-family-label">
                <td colSpan={colCount}>
                  {family.root ? (
                    <button
                      type="button"
                      className="title-link"
                      onClick={() => open(family.root!)}
                    >
                      <RootBadge />
                      {family.rootTitle}
                    </button>
                  ) : (
                    <span className="task-family-label-text">
                      <RootBadge />
                      {family.rootTitle}
                    </span>
                  )}
                  <span className="task-family-count">하위 {family.tasks.length}건</span>
                </td>
              </tr>
            ) : null}
            {family.tasks.map((task) => {
              const isFamilyRoot = Boolean(
                family.root && sameTaskId(task.id, family.root.id) && inFamily,
              );
              return renderRow(task, { inFamily, isFamilyRoot });
            })}
          </tbody>
        );
      })}
    </>
  );
}
