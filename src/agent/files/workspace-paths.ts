/**
 * Layout of the agent's Postgres-backed workspace. Paths are what the agent sees; the `/inbox/` and
 * `/uploads/` prefixes are routed by CompositeBackend to StoreBackends namespaced per user and thread.
 *
 *   /inbox/{emailId}/email.md                  headers, attachment manifest, plain-text body
 *   /inbox/{emailId}/attachments/{fileName}    original bytes (PDFs and images are read natively by the model)
 *   /uploads/{fileName}.pdf                    a PDF the user imported (one per thread)
 */
export const INBOX_ROUTE = '/inbox/';
export const UPLOADS_ROUTE = '/uploads/';
export const USERS_NAMESPACE_ROOT = 'finsift-users';

export type WorkspaceArea = 'inbox' | 'uploads';

/**
 * PostgresStore rejects namespace labels containing SQL LIKE wildcards ("%", "_") or backslashes,
 * and Clerk ids look like "user_2abc…". Clerk ids and ULIDs never contain "-", so this is lossless.
 */
export function namespaceLabel(value: string): string {
  return value.replace(/[_%\\]/g, '-');
}

export function userNamespacePrefix(userId: string): string[] {
  return [USERS_NAMESPACE_ROOT, namespaceLabel(userId)];
}

export function workspaceNamespace(area: WorkspaceArea, userId: string, threadId: string): string[] {
  return [...userNamespacePrefix(userId), 'threads', namespaceLabel(threadId), area];
}

export function inboxNamespace(userId: string, threadId: string): string[] {
  return workspaceNamespace('inbox', userId, threadId);
}

export function uploadsNamespace(userId: string, threadId: string): string[] {
  return workspaceNamespace('uploads', userId, threadId);
}

export function emailMarkdownPath(emailId: string): string {
  return `${INBOX_ROUTE}${emailId}/email.md`;
}

export function attachmentPath(emailId: string, fileName: string): string {
  return `${INBOX_ROUTE}${emailId}/attachments/${fileName}`;
}

export function uploadPath(fileName: string): string {
  return `${UPLOADS_ROUTE}${fileName}`;
}

/** Extracts the email id from any `/inbox/{emailId}/...` path. */
export function emailIdFromPath(path: string): string | null {
  const match = /^\/inbox\/([0-9A-HJKMNP-TV-Z]{26})\//.exec(path);
  return match?.[1] ?? null;
}

export function areaOf(path: string): WorkspaceArea {
  return path.startsWith(UPLOADS_ROUTE) ? 'uploads' : 'inbox';
}

/** Path relative to its route, as the StoreBackend sees it after CompositeBackend strips the prefix. */
export function toStoreKey(path: string): string {
  for (const route of [INBOX_ROUTE, UPLOADS_ROUTE]) {
    if (path.startsWith(route)) return `/${path.slice(route.length)}`;
  }
  return path;
}
