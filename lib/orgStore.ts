import { createDocument, deleteDocument, listDocuments, patchDocument, strField } from "./firestoreRest";
import type { OrgUnit, OrgUnitKind } from "./org";

const COLLECTION = "orgUnits";

function toUnit(id: string, fields: Parameters<typeof strField>[0]): OrgUnit | null {
  const kind = strField(fields, "kind");
  const name = strField(fields, "name").trim();
  if (!name) return null;
  if (kind !== "division" && kind !== "team") return null;
  return {
    id,
    name: name.slice(0, 79),
    kind,
    parentId: strField(fields, "parentId").trim(),
  };
}

export async function listOrgUnits(token: string): Promise<OrgUnit[]> {
  const docs = await listDocuments(token, COLLECTION);
  return docs
    .map((doc) => toUnit(doc.id, doc.fields))
    .filter((unit): unit is OrgUnit => Boolean(unit))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "division" ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
}

function newOrgId(kind: OrgUnitKind): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${kind === "division" ? "d" : "t"}_${raw}`;
}

export async function createOrgUnit(
  token: string,
  input: { name: string; kind: OrgUnitKind; parentId?: string },
): Promise<OrgUnit> {
  const name = input.name.trim().slice(0, 79);
  if (!name) throw new Error("조직 이름이 필요합니다.");
  const parentId = input.kind === "team" ? (input.parentId ?? "").trim() : "";
  if (input.kind === "team" && !parentId) throw new Error("팀은 본부 아래에 만듭니다.");
  const id = newOrgId(input.kind);
  await createDocument(token, COLLECTION, id, {
    name,
    kind: input.kind,
    parentId,
  });
  return { id, name, kind: input.kind, parentId };
}

export async function renameOrgUnit(token: string, id: string, name: string): Promise<OrgUnit> {
  const next = name.trim().slice(0, 79);
  if (!next) throw new Error("조직 이름이 필요합니다.");
  const units = await listOrgUnits(token);
  const current = units.find((unit) => unit.id === id);
  if (!current) throw new Error("조직을 찾지 못했습니다.");
  await patchDocument(token, COLLECTION, id, { name: next }, ["name"]);
  return { ...current, name: next };
}

export async function deleteOrgUnit(token: string, id: string): Promise<{ id: string; childIds: string[] }> {
  const units = await listOrgUnits(token);
  const current = units.find((unit) => unit.id === id);
  if (!current) throw new Error("조직을 찾지 못했습니다.");
  const childIds = units.filter((unit) => unit.parentId === id).map((unit) => unit.id);
  for (const childId of childIds) {
    await deleteDocument(token, COLLECTION, childId);
  }
  await deleteDocument(token, COLLECTION, id);
  return { id, childIds };
}
