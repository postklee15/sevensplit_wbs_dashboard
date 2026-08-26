"use client";

import type { AccessProfile } from "@/lib/acl";
import { canViewAllLoad } from "@/lib/acl";
import type { OrgUnit } from "@/lib/org";
import { divisionsVisibleTo } from "@/lib/org";

export function DivisionChips({
  profile,
  units,
  divisionId,
  onChange,
}: {
  profile: AccessProfile;
  units: OrgUnit[];
  divisionId: string | null;
  onChange: (id: string | null) => void;
}) {
  if (!canViewAllLoad(profile)) return null;
  const options = divisionsVisibleTo(profile, units);
  if (options.length === 0) return null;
  const showAll = profile.role === "superAdmin";

  return (
    <section className="chips" aria-label="본부 필터">
      <span className="chip-group-label">본부</span>
      {showAll ? (
        <button
          className={`chip ${divisionId === null ? "on" : ""}`}
          type="button"
          onClick={() => onChange(null)}
        >
          전체 본부
        </button>
      ) : null}
      {options.map((unit) => (
        <button
          key={unit.id}
          className={`chip ${divisionId === unit.id ? "on" : ""}`}
          type="button"
          onClick={() => onChange(unit.id)}
        >
          {unit.name}
        </button>
      ))}
    </section>
  );
}
