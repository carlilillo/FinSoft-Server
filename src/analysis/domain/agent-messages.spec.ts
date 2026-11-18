import { buildDocumentMessage, buildStartMessage } from './agent-messages.js';

describe('buildStartMessage', () => {
  const emails = [{ id: '01JEMAIL0000000000000000AA', subject: 'Factura', senderEmail: 'billing@acme.es' }];

  it("lists the user's own addresses so issued invoices can be skipped", () => {
    const message = buildStartMessage(emails, ['ana@example.com', 'ana@work.es']);
    expect(message).toContain('ana@example.com, ana@work.es');
    expect(message).toContain('Do not extract invoices I issued');
    expect(message).toContain('/inbox/01JEMAIL0000000000000000AA/email.md');
  });

  it('says when the addresses are unknown', () => {
    expect(buildStartMessage(emails, [])).toContain('My own email addresses are unknown.');
  });
});

describe('buildDocumentMessage', () => {
  it('tells the extractor the user issued the invoice', () => {
    const message = buildDocumentMessage('/uploads/f.pdf', 'f.pdf', 'application/pdf', 'issued');
    expect(message).toContain('a PDF');
    expect(message).toContain('ISSUED to one of my customers');
  });

  it('tells the extractor the user received the invoice', () => {
    const message = buildDocumentMessage('/uploads/t.jpg', 'ticket.jpg', 'image/jpeg', 'received');
    expect(message).toContain('an image (image/jpeg)');
    expect(message).toContain('RECEIVED from one of my providers');
  });
});
