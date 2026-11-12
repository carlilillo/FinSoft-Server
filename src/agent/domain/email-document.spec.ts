import {
  attachmentFileName,
  isRelevantAttachment,
  resolveAttachmentType,
  renderEmailMarkdown,
} from './email-document.js';

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
        attachments: [
          {
            fileName: 'factura.pdf',
            contentType: 'application/pdf',
            sizeBytes: 52_000,
          },
        ],
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
    expect(attachmentFileName('IMG_0042.HEIC', 'image/heic', 4, taken)).toBe('IMG_0042.heic');
    expect(attachmentFileName('scan.tif', 'image/tiff', 5, taken)).toBe('scan.tiff');
  });

  it('types PDFs and images from their content, whatever the mail client declared', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(resolveAttachmentType('application/octet-stream', jpeg)).toBe('image/jpeg');
    expect(resolveAttachmentType('image/png', jpeg)).toBe('image/jpeg');
    expect(resolveAttachmentType('application/octet-stream', new TextEncoder().encode('%PDF-1.4'))).toBe(
      'application/pdf',
    );
    expect(resolveAttachmentType('application/xml; charset=utf-8', new TextEncoder().encode('<?xml'))).toBe('text/xml');
    expect(resolveAttachmentType('text/calendar', new TextEncoder().encode('BEGIN:VCALENDAR'))).toBe('text/calendar');
  });

  it('keeps every image that can be an invoice and skips icons, layout images and other files', () => {
    const attachment = (contentType: string, sizeBytes: number, embedded = false) => ({
      contentType,
      sizeBytes,
      embedded,
    });
    expect(isRelevantAttachment(attachment('image/png', 4_000))).toBe(false);
    expect(isRelevantAttachment(attachment('image/jpeg', 40_000, true))).toBe(false);
    expect(isRelevantAttachment(attachment('image/jpeg', 40_000))).toBe(true);
    expect(isRelevantAttachment(attachment('image/heic', 1_800_000, true))).toBe(true);
    for (const type of ['image/webp', 'image/gif', 'image/heif', 'image/avif', 'image/tiff', 'image/bmp']) {
      expect(isRelevantAttachment(attachment(type, 200_000))).toBe(true);
    }
    expect(isRelevantAttachment(attachment('image/svg+xml', 200_000))).toBe(false);
    expect(isRelevantAttachment(attachment('application/pdf', 1_000))).toBe(true);
    expect(isRelevantAttachment(attachment('text/calendar', 1_000))).toBe(false);
  });
});
