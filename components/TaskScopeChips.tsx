"use client";

import { TASK_SCOPE_OPTIONS, type TaskScope } from "@/lib/metrics";

export function TaskScopeChips({
  value,
  onChange,
}: {
  value: TaskScope;
  onChange: (next: TaskScope) => void;
}) {
  return (
    <div className="view-switch" role="radiogroup" aria-label="작업 범위">
      {TASK_SCOPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`chip ${value === option.value ? "on" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
