import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

export function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseAppletConfig;
}

const FIREBASE_CONFIG = loadFirebaseAppletConfig();

export type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export function decodeFirestoreValue(val: FirestoreValue): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue.fields ?? {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  return null;
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeDocument(doc: { name?: string; fields?: Record<string, FirestoreValue> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    out[k] = decodeFirestoreValue(v);
  }
  return out;
}

function firestoreBaseUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/${FIREBASE_CONFIG.firestoreDatabaseId}/documents`;
}

function firestoreDocResourceName(docPath: string): string {
  return `projects/${FIREBASE_CONFIG.projectId}/databases/${FIREBASE_CONFIG.firestoreDatabaseId}/documents/${docPath}`;
}

export async function getFirestoreDoc(
  docPath: string,
  bearerToken: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${firestoreBaseUrl()}/${docPath}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(`Firestore GET failed (${response.status}) for ${docPath}`);
  }
  const body = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return body.fields ? decodeDocument(body) : null;
}

export async function listFirestoreCollection(
  collectionPath: string,
  bearerToken: string,
  pageSize = 200,
): Promise<Array<Record<string, unknown>>> {
  const docs: Array<Record<string, unknown>> = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${firestoreBaseUrl()}/${collectionPath}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (response.status === 403 || response.status === 404) {
      return docs;
    }
    if (!response.ok) {
      throw new Error(`Firestore LIST failed (${response.status}) for ${collectionPath}`);
    }
    const body = (await response.json()) as {
      documents?: Array<{ name?: string; fields?: Record<string, FirestoreValue> }>;
      nextPageToken?: string;
    };
    for (const item of body.documents ?? []) {
      docs.push(decodeDocument(item));
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);

  return docs;
}

export async function queryFirestoreSubcollection(params: {
  parentDocPath: string;
  collectionId: string;
  memberUid: string;
  bearerToken: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const url = `${firestoreBaseUrl()}/${params.parentDocPath}:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: params.collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'memberIds' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: params.memberUid },
          },
        },
        limit: params.limit ?? 150,
      },
    }),
  });

  if (response.status === 403 || response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Firestore runQuery failed (${response.status}) for ${params.parentDocPath}/${params.collectionId}`);
  }

  const rows = (await response.json()) as Array<{
    document?: { name?: string; fields?: Record<string, FirestoreValue> };
  }>;
  const docs: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (row.document?.fields) {
      docs.push(decodeDocument(row.document));
    }
  }
  return docs;
}

export async function createFirestoreDocWithServerTime(
  docPath: string,
  fields: Record<string, unknown>,
  serverTimestampFields: string[],
  bearerToken: string,
): Promise<void> {
  const encodedFields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      encodedFields[k] = encodeFirestoreValue(v);
    }
  }

  const write: Record<string, unknown> = {
    update: {
      name: firestoreDocResourceName(docPath),
      fields: encodedFields,
    },
    currentDocument: { exists: false },
  };
  if (serverTimestampFields.length > 0) {
    write.updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }

  const response = await fetch(`${firestoreBaseUrl()}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [write] }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore CREATE commit failed (${response.status}) for ${docPath}: ${errText}`);
  }
}

export async function updateFirestoreDocWithServerTime(
  docPath: string,
  fields: Record<string, unknown>,
  serverTimestampFields: string[],
  bearerToken: string,
): Promise<void> {
  const encodedFields: Record<string, FirestoreValue> = {};
  const fieldPaths: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      encodedFields[k] = encodeFirestoreValue(v);
      fieldPaths.push(k);
    }
  }

  const write: Record<string, unknown> = {
    update: {
      name: firestoreDocResourceName(docPath),
      fields: encodedFields,
    },
    updateMask: {
      fieldPaths,
    },
    currentDocument: { exists: true },
  };
  if (serverTimestampFields.length > 0) {
    write.updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }

  const response = await fetch(`${firestoreBaseUrl()}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [write] }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Firestore UPDATE commit failed (${response.status}) for ${docPath}: ${errText}`);
  }
}

// Optional Service Account OAuth2 token for unattended 24/7 cron processing
interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedServiceToken: { token: string; expiresAtMs: number } | null = null;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function getServiceAccountAccessToken(): Promise<string | null> {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;

  const now = Date.now();
  if (cachedServiceToken && cachedServiceToken.expiresAtMs > now + 60_000) {
    return cachedServiceToken.token;
  }

  let sa: ServiceAccountJson;
  try {
    sa = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    return null;
  }
  if (!sa.client_email || !sa.private_key) return null;

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: tokenUri,
      iat,
      exp,
    }),
  );

  const signInput = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const assertion = `${signInput}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;

  cachedServiceToken = {
    token: body.access_token,
    expiresAtMs: now + (body.expires_in ?? 3600) * 1000,
  };
  return cachedServiceToken.token;
}
