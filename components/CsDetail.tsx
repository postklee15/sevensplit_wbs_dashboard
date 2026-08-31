"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isUnresolvedCs } from "@/lib/cs";
import type { CsFieldSchema, CsItem, CsPatch, CsSchema } from "@/lib/types";

const TEXT_FIELDS: Array<{ key: "answer" | "note" | "feedback"; label: string; rows: number }> = [
  { key: "answer", label: "답변", rows: 8 },
  { key: "note", label: "비고", rows: 4 },
  { key: "feedback", label: "피드백", rows: 4 },
];

type Draft = {
  status: string;
  answer: string;
  note: string;
  feedback: string;
};

function draftFrom(item: CsItem): Draft {
  return {
    status: item.status ?? "",
    answer: item.answer ?? "",
    note: item.note ?? "",
    feedback: item.feedback ?? "",
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="task-detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ItemFields({ item, status }: { item: CsItem; status?: ReactNode }) {
  return (
    <dl className="task-detail-grid">
      {status ? <Field label="상태">{status}</Field> : null}
      <Field label="서비스">{item.service ?? "—"}</Field>
      <Field label="고객명">{item.customerName?.trim() || "—"}</Field>
      <Field label="접수">{item.receivedAt ?? "—"}</Field>
      <Field label="담당">{item.assignees.join(", ") || "—"}</Field>
    </dl>
  );
}

function canWriteTexts(schema: CsSchema): boolean {
  return TEXT_FIELDS.some(({ key }) => schema.fields[key]?.writable);
}

function TextControl({
  field,
  value,
  onChange,
  rows,
}: {
  field: CsFieldSchema;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  if (field.type === "select" || field.type === "status") {
    const extra = value && !field.options.includes(value) ? [value] : [];
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={field.type === "status"}
      >
        {field.type !== "status" ? <option value="">(없음)</option> : null}
        {[...extra, ...field.options].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <textarea
      className="task-detail-wide"
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function CsDetail({
  item: initial,
  schema: initialSchema,
  token,
  onClose,
  onSaved,
}: {
  item: CsItem;
  schema: CsSchema;
  token: string;
  onClose: () => void;
  onSaved: (item: CsItem) => void;
}) {
  const [item, setItem] = useState<CsItem>(initial);
  const [schema, setSchema] = useState<CsSchema>(initialSchema);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canEdit = schema.writable || canWriteTexts(schema);
  const open = isUnresolvedCs(item.status);
  const statusOptions = [...schema.statusOptions];
  if (draft.status && !statusOptions.includes(draft.status)) statusOptions.unshift(draft.status);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaved(false);
    setSaveError(null);
    (async () => {
      try {
        const res = await fetch(`/api/cs/${encodeURIComponent(initial.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          credentials: "include",
        });
        const body = (await res.json()) as { item?: CsItem; schema?: CsSchema; error?: string };
        if (!res.ok || !body.item) {
          throw new Error(body.error || `조회 실패 (${res.status})`);
        }
        if (cancelled) return;
        setItem(body.item);
        if (body.schema) setSchema(body.schema);
        setDraft(draftFrom(body.item));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "CS를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id, token]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch: CsPatch = {};
      if (schema.writable) {
        const status = draft.status.trim();
        if (!status) throw new Error("상태를 비울 수 없습니다.");
        patch.status = status;
      }
      for (const { key } of TEXT_FIELDS) {
        if (schema.fields[key]?.writable) patch[key] = draft[key];
      }
      if (Object.keys(patch).length === 0) {
        throw new Error("바꿀 항목이 없습니다.");
      }
      const res = await fetch(`/api/cs/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as { item?: CsItem; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error || `저장 실패 (${res.status})`);
      setItem(body.item);
      setDraft(draftFrom(body.item));
      setSaved(true);
      onSaved(body.item);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const showBody = Boolean(item.body.trim() || schema.fields.body);

  return (
    <div className="task-detail-root">
      <button className="task-detail-backdrop" type="button" aria-label="닫기" onClick={onClose} />
      <aside className="task-detail-panel" role="dialog" aria-modal="true" aria-labelledby="cs-detail-title">
        <header className="task-detail-head">
          <p className="kicker">CS 상세</p>
          <div className="task-detail-actions">
            {item.url ? (
              <a className="chip" href={item.url} target="_blank" rel="noopener noreferrer">
                노션에서 열기
              </a>
            ) : null}
            <button className="chip" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>
        <h2 id="cs-detail-title">{item.title}</h2>
        <div className="task-detail-badges">
          <span className={`badge ${open ? "미지정" : "완료"}`}>{item.status || "—"}</span>
        </div>
        {loading ? <p className="muted">최신 속성을 불러오는 중입니다.</p> : null}
        {loadError ? <p className="auth-error">{loadError}</p> : null}

        {canEdit ? (
          <form className="task-detail-form" onSubmit={(event) => void onSave(event)}>
            <ItemFields
              item={item}
              status={
                schema.writable && statusOptions.length > 0 ? (
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                    required
                  >
                    {!draft.status ? <option value="">(없음)</option> : null}
                    {statusOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  item.status || "—"
                )
              }
            />
            {showBody ? (
              <section className="task-detail-issue">
                <h3>문의내용</h3>
                {item.body.trim() ? (
                  <p>{item.body}</p>
                ) : (
                  <p className="muted">적힌 내용이 없습니다.</p>
                )}
              </section>
            ) : null}
            {TEXT_FIELDS.map(({ key, label, rows }) => {
              const field = schema.fields[key];
              return (
                <section className="task-detail-issue" key={key}>
                  <h3>{label}</h3>
                  {field?.writable ? (
                    <TextControl
                      field={field}
                      value={draft[key]}
                      onChange={(value) => setDraft({ ...draft, [key]: value })}
                      rows={rows}
                    />
                  ) : (
                    <>
                      {item[key].trim() ? <p>{item[key]}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
                      {!field ? (
                        <p className="muted task-detail-hint">
                          노션 CS DB에 「{label}」 속성이 없습니다. 열을 추가한 뒤 「노션 다시 읽기」를 누르면 여기서
                          저장할 수 있습니다.
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              );
            })}
            {saveError ? <p className="auth-error">{saveError}</p> : null}
            {saved ? <p className="task-detail-ok">노션에 저장했습니다.</p> : null}
            <div className="task-detail-save-row">
              <button className="btn" type="submit" disabled={saving || loading}>
                {saving ? "저장 중" : "노션에 저장"}
              </button>
            </div>
            <p className="task-detail-note muted">
              저장하면 노션의 상태·답변·비고·피드백이 바뀝니다. 문의내용은 앱에서 읽기만 합니다.
            </p>
          </form>
        ) : (
          <>
            <ItemFields item={item} />
            {showBody ? (
              <section className="task-detail-issue">
                <h3>문의내용</h3>
                {item.body.trim() ? <p>{item.body}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
              </section>
            ) : null}
            {TEXT_FIELDS.map(({ key, label }) => (
              <section className="task-detail-issue" key={key}>
                <h3>{label}</h3>
                {item[key].trim() ? <p>{item[key]}</p> : <p className="muted">적힌 내용이 없습니다.</p>}
              </section>
            ))}
            <p className="task-detail-note muted">
              이 CS는 앱에서 수정할 수 없습니다. 노션에서 열기로 페이지를 볼 수 있습니다.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
