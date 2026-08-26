const PROJECT_ID = "sevensplit-wbs-dashboard";
const API_KEY = "AIzaSyBFZfijzKJPrKIqJxCqzo96YDdq3gqcWEw";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function withKey(url: string): string {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}key=${API_KEY}`;
}

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { nullValue: null };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

function encodeDocId(id: string): string {
  return encodeURIComponent(id);
}

function docIdFromName(name: string): string {
  const parts = name.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export function strField(fields: Record<string, FirestoreValue> | undefined, key: string): string {
  const value = fields?.[key];
  return value && "stringValue" in value ? value.stringValue : "";
}

export function boolField(
  fields: Record<string, FirestoreValue> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = fields?.[key];
  return value && "booleanValue" in value ? value.booleanValue : fallback;
}

export async function getDocument(
  token: string,
  collection: string,
  id: string,
): Promise<FirestoreDocument | null> {
  const res = await fetch(withKey(`${BASE}/${collection}/${encodeDocId(id)}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore GET ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as FirestoreDocument;
}

export async function listDocuments(
  token: string,
  collection: string,
): Promise<Array<FirestoreDocument & { id: string }>> {
  const res = await fetch(withKey(`${BASE}/${collection}?pageSize=300`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore LIST ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { documents?: FirestoreDocument[] };
  return (body.documents ?? []).map((doc) => ({
    ...doc,
    id: docIdFromName(doc.name ?? ""),
  }));
}

export async function patchDocument(
  token: string,
  collection: string,
  id: string,
  fields: Record<string, string | boolean>,
  mask: string[],
): Promise<FirestoreDocument> {
  const params = new URLSearchParams();
  for (const path of mask) params.append("updateMask.fieldPaths", path);
  const firestoreFields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    firestoreFields[key] = typeof value === "boolean" ? { booleanValue: value } : { stringValue: value };
  }
  const res = await fetch(withKey(`${BASE}/${collection}/${encodeDocId(id)}?${params.toString()}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: firestoreFields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore PATCH ${res.status}: ${text.slice(0, 400)}`);
  }
  return (await res.json()) as FirestoreDocument;
}

function toFirestoreFields(fields: Record<string, string | boolean>): Record<string, FirestoreValue> {
  const firestoreFields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    firestoreFields[key] = typeof value === "boolean" ? { booleanValue: value } : { stringValue: value };
  }
  return firestoreFields;
}

export async function createDocument(
  token: string,
  collection: string,
  id: string,
  fields: Record<string, string | boolean>,
): Promise<FirestoreDocument> {
  const res = await fetch(withKey(`${BASE}/${collection}?documentId=${encodeDocId(id)}`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore CREATE ${res.status}: ${text.slice(0, 400)}`);
  }
  return (await res.json()) as FirestoreDocument;
}

export async function deleteDocument(token: string, collection: string, id: string): Promise<void> {
  const res = await fetch(withKey(`${BASE}/${collection}/${encodeDocId(id)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore DELETE ${res.status}: ${text.slice(0, 400)}`);
  }
}
