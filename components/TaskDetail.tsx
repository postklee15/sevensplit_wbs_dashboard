"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AccessProfile } from "@/lib/acl";
import { canCascadeWbsDelay, canEditWbsTask } from "@/lib/acl";
import {
  UNASSIGNED,
  effectiveEnd,
  extraScheduleDays,
  plannedEffortDays,
  remainingEffort,
  taskStatus,
  todayKst,
} from "@/lib/metrics";
import { scheduleApprovalOf } from "@/lib/scheduleApproval";
import { isRootTask } from "@/lib/taskTree";
import type { Task, TaskPatch, TaskWriteBody, WbsFieldKey, WbsFieldSchema, WbsSchema } from "@/lib/types";
import { emitWbsDataRefresh } from "@/lib/wbsRefresh";

export type TaskView = Pick<Task, "id" | "title"> & Partial<Omit<Task, "id" | "title">>;

type TaskDetailContextValue = {
  open: (task: TaskView) => void;
  close: () => void;
  profile: AccessProfile;
  token: string;
  schema: WbsSchema | null;
};

const TaskDetailContext = createContext<TaskDetailContextValue | null>(null);

export function useTaskDetail(): TaskDetailContextValue {
  const value = useContext(TaskDetailContext);
  if (!value) {
    throw new Error("TaskDetailProvider가 필요합니다.");
  }
  return value;
}

function toTask(view: TaskView): Task {
  return {
    id: view.id,
    title: view.title,
    url: view.url ?? "",
    ancestorTitles: view.ancestorTitles ?? [],
    assignees: view.assignees ?? [],
    assigneePeople: view.assigneePeople ?? [],
    ownService: view.ownService ?? null,
    service: view.service ?? null,
    attribute: view.attribute ?? null,
    importance: view.importance ?? null,
    progress: view.progress ?? null,
    allocation: view.allocation ?? null,
    effortDays: view.effortDays ?? null,
    extraDays: view.extraDays ?? null,
    start: view.start ?? null,
    end: view.end ?? null,
    scheduleApproval: view.scheduleApproval ?? null,
    deployApproval: view.deployApproval ?? null,
    issue: view.issue ?? "",
    delayReason: view.delayReason ?? null,
    isLeaf: view.isLeaf ?? true,
    parentId: view.parentId ?? null,
  };
}

function hasField(view: TaskView, key: keyof Task): boolean {
  return Object.prototype.hasOwnProperty.call(view, key);
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: n < 10 && digits > 0 ? 1 : 0,
  });
}

function pct(value: number | null): string {
  if (value == null) return "—";
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.min(Math.max(n, 0), 100))}%`;
}

function toPctInput(value: number | null): string {
  if (value == null) return "";
  if (value <= 1) return String(Math.round(value * 100));
  return String(Math.round(Math.min(value, 100)));
}

function dateRange(task: Task): string {
  if (!task.start) return "—";
  if (!task.end || task.end === task.start) return task.start;
  return `${task.start} – ${task.end}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="task-detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function fieldOf(schema: WbsSchema | null, key: WbsFieldKey): WbsFieldSchema | undefined {
  return schema?.fields[key];
}

function isWritable(schema: WbsSchema | null, key: WbsFieldKey): boolean {
  return Boolean(fieldOf(schema, key)?.writable);
}

type Draft = {
  title: string;
  scheduleApproval: string;
  service: string;
  attribute: string;
  importance: string;
  assigneeIds: string[];
  start: string;
  end: string;
  extraDays: string;
  deployApproval: string;
  progress: string;
  allocation: string;
  effortDays: string;
  delayReason: string;
  issue: string;
};

function draftFromTask(task: Task): Draft {
  return {
    title: task.title,
    scheduleApproval: task.scheduleApproval?.trim() || "",
    service: task.ownService?.trim() || "",
    attribute: task.attribute ?? "",
    importance: task.importance ?? "",
    assigneeIds: task.assigneePeople.map((person) => person.id),
    start: task.start ?? "",
    end: task.end && task.end !== task.start ? task.end : task.start ?? "",
    extraDays: task.extraDays != null && task.extraDays > 0 ? String(Math.floor(task.extraDays)) : "",
    deployApproval: task.deployApproval?.trim() || "",
    progress: toPctInput(task.progress),
    allocation: toPctInput(task.allocation),
    effortDays: task.effortDays == null ? "" : String(task.effortDays),
    delayReason: task.delayReason ?? "",
    issue: task.issue ?? "",
  };
}

function parseOptionalNumber(value: string, label: string, min: number, max?: number): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${label}은(는) 숫자여야 합니다.`);
  if (n < min) throw new Error(`${label}은(는) ${min} 이상이어야 합니다.`);
  if (max != null && n > max) throw new Error(`${label}은(는) ${max} 이하여야 합니다.`);
  return n;
}

function patchFromDraft(draft: Draft, schema: WbsSchema): TaskPatch {
  const patch: TaskPatch = {};
  if (isWritable(schema, "title")) patch.title = draft.title.trim();
  if (isWritable(schema, "scheduleApproval")) {
    patch.scheduleApproval = draft.scheduleApproval.trim() || null;
  }
  if (isWritable(schema, "service")) patch.service = draft.service.trim() || null;
  if (isWritable(schema, "attribute")) patch.attribute = draft.attribute.trim() || null;
  if (isWritable(schema, "importance")) patch.importance = draft.importance.trim() || null;
  if (isWritable(schema, "assignees")) patch.assigneeIds = draft.assigneeIds;
  if (isWritable(schema, "schedule")) {
    patch.start = draft.start.trim() || null;
    patch.end = draft.end.trim() || null;
  }
  if (isWritable(schema, "extraDays")) {
    patch.extraDays = parseOptionalNumber(draft.extraDays, "추가 일정", 0);
  }
  if (isWritable(schema, "deployApproval")) {
    patch.deployApproval = draft.deployApproval.trim() || null;
  }
  if (isWritable(schema, "progress")) {
    patch.progress = parseOptionalNumber(draft.progress, "진척", 0, 100);
  }
  if (isWritable(schema, "allocation")) {
    patch.allocation = parseOptionalNumber(draft.allocation, "투입률", 0, 100);
  }
  if (isWritable(schema, "effortDays")) {
    patch.effortDays = parseOptionalNumber(draft.effortDays, "소요일", 0);
  }
  if (isWritable(schema, "delayReason")) patch.delayReason = draft.delayReason;
  if (isWritable(schema, "issue")) patch.issue = draft.issue;
  return patch;
}

function OptionSelect({
  value,
  options,
  onChange,
  emptyLabel,
  required,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  required?: boolean;
}) {
  const extra = value && !options.includes(value) ? [value] : [];
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      {!required || emptyLabel ? <option value="">{emptyLabel ?? "미지정"}</option> : null}
      {[...extra, ...options].map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function OptionChecks({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const extra = selected.filter((name) => !options.includes(name));
  return (
    <div className="task-detail-checks">
      {[...extra, ...options].map((option) => {
        const on = selected.includes(option);
        return (
          <label key={option}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => {
                onChange(on ? selected.filter((name) => name !== option) : [...selected, option]);
              }}
            />
            {option}
          </label>
        );
      })}
    </div>
  );
}

function SchemaInput({
  field,
  value,
  onChange,
  emptyLabel,
  multiline,
}: {
  field: WbsFieldSchema;
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  multiline?: boolean;
}) {
  if (field.type === "multi_select") {
    const selected = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return (
      <OptionChecks
        options={field.options}
        selected={selected}
        onChange={(next) => onChange(next.join(", "))}
      />
    );
  }
  if (field.type === "select" || field.type === "status") {
    return (
      <OptionSelect
        value={value}
        options={field.options}
        onChange={onChange}
        emptyLabel={field.type === "status" ? undefined : emptyLabel}
        required={field.type === "status"}
      />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (multiline || field.type === "rich_text") {
    return (
      <textarea
        className="task-detail-wide"
        rows={multiline ? 5 : 3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return <input value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function TaskDetailProvider({
  children,
  profile,
  token,
}: {
  children: ReactNode;
  profile: AccessProfile;
  token: string;
}) {
  const [task, setTask] = useState<TaskView | null>(null);
  const [schema, setSchema] = useState<WbsSchema | null>(null);
  const open = useCallback((next: TaskView) => setTask(next), []);
  const close = useCallback(() => setTask(null), []);
  const value = useMemo(
    () => ({ open, close, profile, token, schema }),
    [open, close, profile, token, schema],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wbs/schema", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { schema?: WbsSchema };
        if (!cancelled && body.schema) setSchema(body.schema);
      } catch {
        // 패널을 열 때 다시 시도
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!task) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [task, close]);

  return (
    <TaskDetailContext.Provider value={value}>
      {children}
      {task ? <TaskDetailPanel view={task} onClose={close} /> : null}
    </TaskDetailContext.Provider>
  );
}

function TaskDetailPanel({ view, onClose }: { view: TaskView; onClose: () => void }) {
  const { profile, token, schema } = useTaskDetail();
  const [hydrated, setHydrated] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cascadeDelay, setCascadeDelay] = useState(true);
  const [cascadeNote, setCascadeNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setHydrated(null);
    setDraft(null);
    setSaved(false);
    setSaveError(null);
    setCascadeNote(null);
    (async () => {
      try {
        const res = await fetch(`/api/wbs/${encodeURIComponent(view.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          credentials: "include",
        });
        const body = (await res.json()) as { task?: Task; error?: string };
        if (!res.ok || !body.task) {
          throw new Error(body.error || `조회 실패 (${res.status})`);
        }
        if (cancelled) return;
        const next: Task = {
          ...toTask(view),
          ...body.task,
          ancestorTitles: body.task.ancestorTitles.length
            ? body.task.ancestorTitles
            : (view.ancestorTitles ?? []),
          parentId: body.task.parentId ?? view.parentId ?? null,
          service: body.task.ownService || body.task.service || view.service || null,
          url: body.task.url || view.url || "",
        };
        setHydrated(next);
        setDraft(draftFromTask(next));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "작업을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, token]);

  const task = hydrated ?? toTask(view);
  const canEdit = canEditWbsTask(profile, task.assignees) && Boolean(hydrated) && Boolean(schema);
  const canCascade = canEdit && canCascadeWbsDelay(profile) && isRootTask(task);
  const today = todayKst();
  const path = task.ancestorTitles.filter(Boolean);
  const people = useMemo(() => {
    const map = new Map((schema?.people ?? []).map((person) => [person.id, person]));
    for (const person of task.assigneePeople) {
      if (!map.has(person.id)) map.set(person.id, person);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [schema, task.assigneePeople]);

  const previewTask: Task = draft
    ? {
        ...task,
        start: draft.start.trim() || null,
        end: draft.end.trim() || draft.start.trim() || null,
        extraDays: draft.extraDays.trim() ? Number(draft.extraDays) : null,
        scheduleApproval: draft.scheduleApproval.trim() || null,
        delayReason: draft.delayReason,
        progress: draft.progress.trim() ? Number(draft.progress) : null,
        allocation: draft.allocation.trim() ? Number(draft.allocation) : null,
      }
    : task;
  const previewRemaining = previewTask.start ? remainingEffort(previewTask) : null;
  const previewExtended = extraScheduleDays(previewTask) > 0 ? effectiveEnd(previewTask) : null;
  const previewPlanned = plannedEffortDays(previewTask);
  const status = taskStatus(previewTask, today);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!draft || !schema || !hydrated) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    setCascadeNote(null);
    try {
      const patch: TaskWriteBody = patchFromDraft(draft, schema);
      if (people.length === 0) delete patch.assigneeIds;
      if (canCascade) patch.cascadeDelay = cascadeDelay;
      const res = await fetch(`/api/wbs/${encodeURIComponent(view.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as {
        task?: Task;
        cascaded?: number;
        cascadeFailed?: number;
        error?: string;
      };
      if (!res.ok || !body.task) {
        throw new Error(body.error || `저장 실패 (${res.status})`);
      }
      const next: Task = {
        ...hydrated,
        ...body.task,
        ancestorTitles: hydrated.ancestorTitles,
        parentId: body.task.parentId ?? hydrated.parentId,
        service: body.task.ownService || body.task.service || hydrated.service,
        url: body.task.url || hydrated.url,
      };
      setHydrated(next);
      setDraft(draftFromTask(next));
      setSaved(true);
      if (canCascade && cascadeDelay) {
        const ok = body.cascaded ?? 0;
        const failed = body.cascadeFailed ?? 0;
        if (failed > 0) {
          setCascadeNote(`하위 ${ok}개에 지연을 적용했고, ${failed}개는 실패했습니다.`);
        } else if (ok > 0) {
          setCascadeNote(`하위 ${ok}개에도 같은 추가 일정·지연사유를 적용했습니다.`);
        } else {
          setCascadeNote("하위 작업이 없거나, 적용할 지연 값이 없어 이 작업만 저장했습니다.");
        }
      }
      emitWbsDataRefresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="task-detail-root">
      <button className="task-detail-backdrop" type="button" aria-label="닫기" onClick={onClose} />
      <aside className="task-detail-panel" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
        <header className="task-detail-head">
          <p className="kicker">업무 상세</p>
          <div className="task-detail-actions">
            {task.url ? (
              <a className="chip" href={task.url} target="_blank" rel="noopener noreferrer">
                노션에서 열기
              </a>
            ) : null}
            <button className="chip" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>
        {path.length > 0 ? <p className="title-path">{path.join(" / ")}</p> : null}
        {canEdit && draft ? (
          <form className="task-detail-form" onSubmit={(event) => void onSave(event)}>
            {isWritable(schema, "title") ? (
              <input
                className="task-detail-title-input"
                id="task-detail-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
              />
            ) : (
              <h2 id="task-detail-title">{task.title}</h2>
            )}
            <div className="task-detail-badges">
              <span className={`badge ${status}`}>{status}</span>
              <span className={`badge ap-${scheduleApprovalOf(previewTask)}`}>
                {scheduleApprovalOf(previewTask)}
              </span>
            </div>
            <dl className="task-detail-grid">
              <Field label="일정승인">
                {isWritable(schema, "scheduleApproval") && fieldOf(schema, "scheduleApproval") ? (
                  <SchemaInput
                    field={fieldOf(schema, "scheduleApproval")!}
                    value={draft.scheduleApproval}
                    onChange={(value) => setDraft({ ...draft, scheduleApproval: value })}
                    emptyLabel="미지정"
                  />
                ) : (
                  scheduleApprovalOf(task)
                )}
              </Field>
              <Field label="서비스">
                {isWritable(schema, "service") && fieldOf(schema, "service") ? (
                  <>
                    <SchemaInput
                      field={fieldOf(schema, "service")!}
                      value={draft.service}
                      onChange={(value) => setDraft({ ...draft, service: value })}
                      emptyLabel="상위 상속"
                    />
                    {!draft.service && task.service ? (
                      <p className="muted task-detail-hint">목록 표시: {task.service}</p>
                    ) : null}
                  </>
                ) : (
                  task.service ?? "—"
                )}
              </Field>
              <Field label="업무속성">
                {isWritable(schema, "attribute") && fieldOf(schema, "attribute") ? (
                  <SchemaInput
                    field={fieldOf(schema, "attribute")!}
                    value={draft.attribute}
                    onChange={(value) => setDraft({ ...draft, attribute: value })}
                    emptyLabel="없음"
                  />
                ) : (
                  task.attribute ?? "—"
                )}
              </Field>
              <Field label="중요도">
                {isWritable(schema, "importance") && fieldOf(schema, "importance") ? (
                  <SchemaInput
                    field={fieldOf(schema, "importance")!}
                    value={draft.importance}
                    onChange={(value) => setDraft({ ...draft, importance: value })}
                    emptyLabel="없음"
                  />
                ) : (
                  task.importance ?? "—"
                )}
              </Field>
              <Field label="담당">
                {isWritable(schema, "assignees") ? (
                  people.length ? (
                    <div className="task-detail-checks">
                      {people.map((person) => {
                        const on = draft.assigneeIds.includes(person.id);
                        return (
                          <label key={person.id}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                setDraft({
                                  ...draft,
                                  assigneeIds: on
                                    ? draft.assigneeIds.filter((id) => id !== person.id)
                                    : [...draft.assigneeIds, person.id],
                                });
                              }}
                            />
                            {person.name}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="muted">담당자 목록을 가져오지 못했습니다. 노션에서 바꿔 주세요.</p>
                  )
                ) : (
                  task.assignees.length ? task.assignees.join(", ") : UNASSIGNED
                )}
              </Field>
              <Field label="일정">
                {isWritable(schema, "schedule") ? (
                  <div className="task-detail-dates">
                    <input
                      type="date"
                      value={draft.start}
                      onChange={(event) => setDraft({ ...draft, start: event.target.value })}
                    />
                    <span>–</span>
                    <input
                      type="date"
                      value={draft.end}
                      onChange={(event) => setDraft({ ...draft, end: event.target.value })}
                    />
                  </div>
                ) : (
                  dateRange(task)
                )}
              </Field>
              <Field label="추가 일정">
                {isWritable(schema, "extraDays") ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft.extraDays}
                      onChange={(event) => setDraft({ ...draft, extraDays: event.target.value })}
                    />
                    {previewExtended ? (
                      <p className="muted task-detail-hint">연장 종료 {previewExtended}</p>
                    ) : null}
                  </>
                ) : extraScheduleDays(task) <= 0 ? (
                  "—"
                ) : (
                  `${extraScheduleDays(task)}일${effectiveEnd(task) ? ` · 연장 종료 ${effectiveEnd(task)}` : ""}`
                )}
              </Field>
              <Field label="배포승인">
                {isWritable(schema, "deployApproval") && fieldOf(schema, "deployApproval") ? (
                  <SchemaInput
                    field={fieldOf(schema, "deployApproval")!}
                    value={draft.deployApproval}
                    onChange={(value) => setDraft({ ...draft, deployApproval: value })}
                    emptyLabel="미지정"
                  />
                ) : (
                  task.deployApproval?.trim() || "—"
                )}
              </Field>
              <Field label="진척">
                {isWritable(schema, "progress") ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.progress}
                    onChange={(event) => setDraft({ ...draft, progress: event.target.value })}
                    placeholder="0–100"
                  />
                ) : (
                  pct(task.progress)
                )}
              </Field>
              <Field label="투입률">
                {isWritable(schema, "allocation") ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.allocation}
                    onChange={(event) => setDraft({ ...draft, allocation: event.target.value })}
                    placeholder="비우면 100%"
                  />
                ) : (
                  pct(task.allocation)
                )}
              </Field>
              <Field label="소요일">
                {isWritable(schema, "effortDays") ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={draft.effortDays}
                      onChange={(event) => setDraft({ ...draft, effortDays: event.target.value })}
                    />
                    {previewPlanned != null ? (
                      <p className="muted task-detail-hint">일정 기준 {fmt(previewPlanned)}인일</p>
                    ) : null}
                  </>
                ) : previewPlanned != null ? (
                  `${fmt(previewPlanned)}인일`
                ) : task.effortDays == null ? (
                  "—"
                ) : (
                  `${fmt(task.effortDays)}인일`
                )}
              </Field>
              {previewRemaining != null ? (
                <Field label="잔여">{fmt(previewRemaining)}인일</Field>
              ) : null}
            </dl>
            <section className="task-detail-issue">
              <h3>지연사유</h3>
              {isWritable(schema, "delayReason") && fieldOf(schema, "delayReason") ? (
                <SchemaInput
                  field={fieldOf(schema, "delayReason")!}
                  value={draft.delayReason}
                  onChange={(value) => setDraft({ ...draft, delayReason: value })}
                  emptyLabel="없음"
                  multiline
                />
              ) : (
                <p>{task.delayReason?.trim() || "적힌 내용이 없습니다."}</p>
              )}
            </section>
            {canCascade ? (
              <label className="task-detail-cascade">
                <input
                  type="checkbox"
                  checked={cascadeDelay}
                  onChange={(event) => setCascadeDelay(event.target.checked)}
                />
                <span>
                  하위 작업에도 같은 추가 일정·지연사유를 일괄 적용합니다. 일정승인이 「지연」이면 하위도 「지연」으로 맞춥니다.
                </span>
              </label>
            ) : null}
            <section className="task-detail-issue">
              <h3>내용 / 이슈</h3>
              {isWritable(schema, "issue") && fieldOf(schema, "issue") ? (
                <SchemaInput
                  field={fieldOf(schema, "issue")!}
                  value={draft.issue}
                  onChange={(value) => setDraft({ ...draft, issue: value })}
                  multiline
                />
              ) : (
                <p>{task.issue.trim() || "적힌 내용이 없습니다."}</p>
              )}
            </section>
            {saveError ? <p className="auth-error">{saveError}</p> : null}
            {saved ? <p className="task-detail-ok">노션에 저장했습니다.</p> : null}
            {cascadeNote ? <p className="task-detail-ok">{cascadeNote}</p> : null}
            <div className="task-detail-save-row">
              <button className="btn" type="submit" disabled={saving || loading}>
                {saving ? (canCascade && cascadeDelay ? "저장 중 (하위 포함)" : "저장 중") : "노션에 저장"}
              </button>
            </div>
            <p className="task-detail-note muted">
              저장하면 노션 속성이 바뀝니다. 상태·잔여·연장 종료는 일정과 진척으로 계산되며 직접 고치지 않습니다.
              {canCascade
                ? " 최상위 작업의 하위 일괄 지연은 팀장·슈퍼관리자만 사용할 수 있습니다."
                : ""}
            </p>
          </form>
        ) : (
          <TaskDetailRead
            view={view}
            task={task}
            loading={loading}
            loadError={loadError}
            canEditLater={canEditWbsTask(profile, task.assignees)}
            schemaReady={Boolean(schema)}
          />
        )}
      </aside>
    </div>
  );
}

function TaskDetailRead({
  view,
  task,
  loading,
  loadError,
  canEditLater,
  schemaReady,
}: {
  view: TaskView;
  task: Task;
  loading: boolean;
  loadError: string | null;
  canEditLater: boolean;
  schemaReady: boolean;
}) {
  const today = todayKst();
  const status = taskStatus(task, today);
  const issue = task.issue.trim();
  const delayReason = (task.delayReason ?? "").trim();
  const assignees = task.assignees.length ? task.assignees.join(", ") : UNASSIGNED;
  const extra = extraScheduleDays(task);
  const extendedEnd = extra > 0 ? effectiveEnd(task) : null;
  const planned = plannedEffortDays(task);
  const showRemaining = Boolean(task.start);
  const showEffort = planned != null || hasField(view, "effortDays") || task.effortDays != null;
  const effortLabel =
    planned != null
      ? `${fmt(planned)}인일`
      : task.effortDays == null
        ? "—"
        : `${fmt(task.effortDays)}인일`;

  return (
    <>
      <h2 id="task-detail-title">{task.title}</h2>
      <div className="task-detail-badges">
        <span className={`badge ${status}`}>{status}</span>
        {hasField(view, "scheduleApproval") || task.scheduleApproval != null ? (
          <span className={`badge ap-${scheduleApprovalOf(task)}`}>{scheduleApprovalOf(task)}</span>
        ) : null}
      </div>
      {loading ? <p className="muted">최신 속성을 불러오는 중입니다.</p> : null}
      {loadError ? <p className="auth-error">{loadError}</p> : null}
      {canEditLater && loading ? (
        <p className="muted">수정 폼을 준비하는 중입니다.</p>
      ) : null}
      {canEditLater && !loading && !schemaReady ? (
        <p className="auth-error">노션 속성 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
      ) : null}
      <dl className="task-detail-grid">
        <Field label="서비스">{task.service ?? "—"}</Field>
        <Field label="업무속성">{task.attribute ?? "—"}</Field>
        <Field label="중요도">{task.importance ?? "—"}</Field>
        <Field label="담당">{assignees}</Field>
        <Field label="일정">{dateRange(task)}</Field>
        <Field label="추가 일정">
          {extra <= 0 ? "—" : `${extra}일${extendedEnd ? ` · 연장 종료 ${extendedEnd}` : ""}`}
        </Field>
        {hasField(view, "deployApproval") || task.deployApproval != null ? (
          <Field label="배포승인">{task.deployApproval?.trim() || "—"}</Field>
        ) : null}
        {hasField(view, "progress") || task.progress != null ? (
          <Field label="진척">{pct(task.progress)}</Field>
        ) : null}
        {hasField(view, "allocation") || task.allocation != null ? (
          <Field label="투입률">{pct(task.allocation)}</Field>
        ) : null}
        {showEffort ? <Field label="소요일">{effortLabel}</Field> : null}
        {showRemaining ? <Field label="잔여">{fmt(remainingEffort(task))}인일</Field> : null}
      </dl>
      <section className="task-detail-issue">
        <h3>지연사유</h3>
        {delayReason ? <p>{delayReason}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
      </section>
      <section className="task-detail-issue">
        <h3>내용 / 이슈</h3>
        {issue ? <p>{issue}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
      </section>
      <p className="task-detail-note muted">
        {canEditLater
          ? "수정 권한이 있으면 속성을 불러온 뒤 이 화면에서 저장할 수 있습니다."
          : "이 작업은 수정할 수 없습니다. 팀원은 본인 담당 업무만 저장할 수 있습니다. 노션에서 열기로 페이지를 볼 수 있습니다."}
      </p>
    </>
  );
}
