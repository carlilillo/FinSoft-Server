/**
 * Layout of the agent's Postgres-backed workspace. Paths are what the agent sees; the
 * `/inbox/` prefix is routed by CompositeBackend to a StoreBackend namespaced per user and thread.
 *
 *   /inbox/{emailId}/email.md                  headers, attachment manifest, plain-text body
 *   /inbox/{emailId}/attachments/{fileName}    original bytes
 *   /inbox/{emailId}/derived/{fileName}...     text / page images produced by convert_attachment
 */
export const INBOX_ROUTE = '/inbox/';
export const USERS_NAMESPACE_ROOT = 'finsift-users';

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

export function inboxNamespace(userId: string, threadId: string): string[] {
  return [...userNamespacePrefix(userId), 'threads', namespaceLabel(threadId), 'inbox'];
}

export function emailMarkdownPath(emailId: string): string {
  return `${INBOX_ROUTE}${emailId}/email.md`;
}

export function attachmentPath(emailId: string, fileName: string): string {
  return `${INBOX_ROUTE}${emailId}/attachments/${fileName}`;
}

export function derivedPath(emailId: string, fileName: string): string {
  return `${INBOX_ROUTE}${emailId}/derived/${fileName}`;
}

/** Extracts the email id from any `/inbox/{emailId}/...` path. */
export function emailIdFromPath(path: string): string | null {
  const match = /^\/inbox\/([0-9A-HJKMNP-TV-Z]{26})\//.exec(path);
  return match?.[1] ?? null;
}

/** Path relative to the `/inbox/` route, as the StoreBackend sees it after CompositeBackend strips the prefix. */
export function toStoreKey(path: string): string {
  return path.startsWith(INBOX_ROUTE) ? `/${path.slice(INBOX_ROUTE.length)}` : path;
}
