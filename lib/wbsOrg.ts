import type { AccessProfile, WbsAccessScope } from "./acl";
import { assigneesInScope, wbsScopeFromMembers } from "./acl";
import { listProfiles } from "./aclStore";
import { filterTasks } from "./metrics";
import type { OrgMember, OrgPayload, OrgUnit } from "./org";
import { listOrgUnits } from "./orgStore";
import type { Task } from "./types";

export async function loadOrgContext(
  token: string,
  profile: AccessProfile,
): Promise<{ members: AccessProfile[]; units: OrgUnit[]; scope: WbsAccessScope }> {
  const [members, units] = await Promise.all([listProfiles(token), listOrgUnits(token)]);
  return { members, units, scope: wbsScopeFromMembers(profile, members) };
}

export function toOrgPayload(members: AccessProfile[], units: OrgUnit[]): OrgPayload {
  const list: OrgMember[] = members.map((member) => ({
    uid: member.uid,
    workName: member.workName,
    displayName: member.displayName,
    email: member.email,
    role: member.role,
    divisionId: member.divisionId,
    teamId: member.teamId,
  }));
  return { units, members: list };
}

export function orgPayloadForProfile(
  profile: AccessProfile,
  members: AccessProfile[],
  units: OrgUnit[],
  scope: WbsAccessScope,
): OrgPayload {
  if (scope.kind === "company") return toOrgPayload(members, units);
  if (scope.kind === "self" || !profile.divisionId) return { units: [], members: [] };
  const home = profile.divisionId;
  return toOrgPayload(
    members.filter((member) => member.divisionId === home),
    units.filter((unit) => unit.id === home || unit.parentId === home),
  );
}

export function filterTasksByScope(tasks: Task[], profile: AccessProfile, scope: WbsAccessScope): Task[] {
  if (scope.kind === "company") return tasks;
  if (scope.kind === "self") {
    const ownName = profile.workName.trim();
    if (!ownName) return [];
    return filterTasks(tasks, {
      leafOnly: false,
      service: null,
      person: ownName,
      hideDone: false,
      query: "",
    });
  }
  return tasks.filter((task) => assigneesInScope(task.assignees, scope));
}
