/** Where an invoice's original document came from: an email attachment or a PDF the user imported. */
export type DocumentSource = 'email' | 'import';

/** S3 layout: everything for a user lives under users/{userId}/ so account deletion is one prefix delete. */
export function buildDocumentKey(props: { userId: string; invoiceId: string; documentId: string; fileName: string }): string {
  return `users/${props.userId}/invoices/${props.invoiceId}/${props.documentId}-${sanitizeFileName(props.fileName)}`;
}

export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '');
  return (cleaned || 'document').slice(-120);
}
