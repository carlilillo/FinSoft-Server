import { emailIdFromPath, inboxNamespace, toStoreKey } from './inbox-paths.js';

describe('inbox paths', () => {
  it('builds Postgres-safe namespaces from Clerk ids (no "_" allowed in labels)', () => {
    const namespace = inboxNamespace('user_2abcDEF', '01JC0000000000000000000000');
    expect(namespace).toEqual(['finsift-users', 'user-2abcDEF', 'threads', '01JC0000000000000000000000', 'inbox']);
    expect(namespace.join('')).not.toMatch(/[_%\\]/);
  });

  it('maps agent paths to store keys and back to email ids', () => {
    expect(toStoreKey('/inbox/01JC0000000000000000000000/email.md')).toBe('/01JC0000000000000000000000/email.md');
    expect(emailIdFromPath('/inbox/01JC0000000000000000000000/attachments/a.pdf')).toBe('01JC0000000000000000000000');
    expect(emailIdFromPath('/etc/passwd')).toBeNull();
  });
});
