import { areaOf, emailIdFromPath, inboxNamespace, toStoreKey, uploadPath, uploadsNamespace } from './workspace-paths.js';

describe('workspace paths', () => {
  it('builds Postgres-safe namespaces from Clerk ids (no "_" allowed in labels)', () => {
    const namespace = inboxNamespace('user_2abcDEF', '01JC0000000000000000000000');
    expect(namespace).toEqual(['finsift-users', 'user-2abcDEF', 'threads', '01JC0000000000000000000000', 'inbox']);
    expect(namespace.join('')).not.toMatch(/[_%\\]/);
    expect(uploadsNamespace('user_2abcDEF', '01JC0000000000000000000000').at(-1)).toBe('uploads');
  });

  it('maps agent paths to store keys and back to email ids', () => {
    expect(toStoreKey('/inbox/01JC0000000000000000000000/email.md')).toBe('/01JC0000000000000000000000/email.md');
    expect(emailIdFromPath('/inbox/01JC0000000000000000000000/attachments/a.pdf')).toBe('01JC0000000000000000000000');
    expect(emailIdFromPath('/etc/passwd')).toBeNull();
  });

  it('routes imported PDFs to the uploads area', () => {
    const path = uploadPath('factura.pdf');
    expect(path).toBe('/uploads/factura.pdf');
    expect(areaOf(path)).toBe('uploads');
    expect(areaOf('/inbox/x/email.md')).toBe('inbox');
    expect(toStoreKey(path)).toBe('/factura.pdf');
  });
});
