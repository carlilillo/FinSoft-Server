import { NoEmailsSelectedError, planContinuation } from './triage.js';

describe('planContinuation', () => {
  const emails = [
    { id: 'a', triage: 'extracted' as const },
    { id: 'b', triage: 'not_invoice' as const },
    { id: 'c', triage: 'likely_invoice' as const },
    { id: 'd', triage: 'failed' as const },
  ];

  it('extracts selected emails not yet extracted and reports wrongly flagged ones', () => {
    expect(planContinuation(emails, ['a', 'b', 'd'])).toEqual({
      toExtract: ['b', 'd'],
      alreadyExtracted: ['a'],
      rejected: ['c'],
    });
  });

  it('ignores ids from other runs and requires at least one known email', () => {
    expect(() => planContinuation(emails, ['zzz'])).toThrow(NoEmailsSelectedError);
  });
});
