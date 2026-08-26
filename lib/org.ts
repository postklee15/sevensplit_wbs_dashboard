export type OrgUnitKind = "division" | "team";

export type OrgUnit = {
  id: string;
  name: string;
  kind: OrgUnitKind;
  parentId: string;
};

export type OrgMember = {
  uid: string;
  workName: string;
  displayName: string;
  email: string;
  role: string;
  divisionId: string;
  teamId: string;
};

export type OrgPayload = {
  units: OrgUnit[];
  members: OrgMember[];
};

export function divisionsOf(units: OrgUnit[]): OrgUnit[] {
  return units
    .filter((unit) => unit.kind === "division")
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function teamsOf(units: OrgUnit[], divisionId: string): OrgUnit[] {
  return units
    .filter((unit) => unit.kind === "team" && unit.parentId === divisionId)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function unitName(units: OrgUnit[], id: string): string {
  return units.find((unit) => unit.id === id)?.name ?? "";
}

export function workNamesForSelection(
  members: OrgMember[],
  divisionId: string | null,
  teamId: string | null,
): Set<string> | null {
  if (!divisionId && !teamId) return null;
  const names = new Set<string>();
  for (const member of members) {
    if (divisionId && member.divisionId !== divisionId) continue;
    if (teamId && member.teamId !== teamId) continue;
    const name = member.workName.trim();
    if (name) names.add(name);
  }
  return names;
}

export function taskMatchesOrgNames(
  assignees: string[],
  names: Set<string> | null,
): boolean {
  if (!names) return true;
  if (assignees.length === 0) return true;
  return assignees.some((name) => names.has(name));
}

/** 슈퍼관리자는 전체, 그 외는 자기 본부·그 아래 팀만. */
export function unitsVisibleTo(
  actor: { isSuperAdmin: boolean; divisionId: string },
  units: OrgUnit[],
): OrgUnit[] {
  if (actor.isSuperAdmin) return units;
  const home = actor.divisionId;
  if (!home) return [];
  return units.filter((unit) => unit.id === home || unit.parentId === home);
}
