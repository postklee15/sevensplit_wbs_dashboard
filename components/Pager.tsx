import { PAGE_SIZES } from "@/lib/pager";

export function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}) {
  return (
    <label className="pager-size">
      페이지당
      <select
        aria-label="페이지당 건수"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}건
          </option>
        ))}
      </select>
    </label>
  );
}

export function Pager({
  page,
  pages,
  total,
  from,
  to,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="pager">
      <span>
        {from}–{to} / {total}건
      </span>
      {pages > 1 ? (
        <div className="pager-nav">
          <button className="chip" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            이전
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="chip"
            type="button"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            다음
          </button>
        </div>
      ) : null}
    </div>
  );
}
