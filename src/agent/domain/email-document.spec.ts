import { attachmentFileName, isRelevantAttachment, renderEmailMarkdown } from './email-document.js';

describe('email document', () => {
  it('renders headers, attachment paths and body for the agent', () => {
    const markdown = renderEmailMarkdown(
      'E1',
      {
        subject: 'Su factura de noviembre',
        senderName: 'Iberdrola',
        senderEmail: 'facturas@iberdrola.es',
        receivedAt: new Date('2026-11-03T08:00:00Z'),
        text: 'Adjuntamos su factura.',
        attachments: [{ fileName: 'factura.pdf', contentType: 'application/pdf', sizeBytes: 52_000 }],
      },
      ['/inbox/E1/attachments/factura.pdf'],
    );
    expect(markdown).toContain('- From: Iberdrola <facturas@iberdrola.es>');
    expect(markdown).toContain('- /inbox/E1/attachments/factura.pdf (application/pdf, 51 KB)');
    expect(markdown).toContain('Adjuntamos su factura.');
  });

  it('builds safe unique file names whose extension matches the content type', () => {
    const taken = new Set<string>();
    expect(attachmentFileName('Factura Nº 12.PDF', 'application/pdf', 0, taken)).toBe('Factura_N_12.pdf');
    expect(attachmentFileName('Factura Nº 12.pdf', 'application/pdf', 1, taken)).toBe('Factura_N_12-2.pdf');
    expect(attachmentFileName('invoice', 'application/pdf', 2, taken)).toBe('invoice.pdf');
    expect(attachmentFileName(null, 'image/jpeg', 3, taken)).toBe('attachment-4.jpg');
  });

  it('skips inline images and small logos but keeps documents', () => {
    expect(isRelevantAttachment('image/png', 4_000, false)).toBe(false);
    expect(isRelevantAttachment('image/jpeg', 200_000, true)).toBe(false);
    expect(isRelevantAttachment('image/jpeg', 200_000, false)).toBe(true);
    expect(isRelevantAttachment('application/pdf', 1_000, false)).toBe(true);
    expect(isRelevantAttachment('text/calendar', 1_000, false)).toBe(false);
  });
});
