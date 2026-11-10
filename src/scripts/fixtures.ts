import { createCanvas } from '@napi-rs/canvas';

/** Fixture emails for the agent smoke test: two invoices (ES PDF, EN image) and two non-invoices. */

export interface FixtureEmail {
  id: string;
  raw: Buffer;
}

export function buildFixtureEmails(today = new Date()): FixtureEmail[] {
  const date = today.toUTCString();
  return [
    {
      id: 'fixture-es-factura',
      raw: mime({
        from: 'Papelería Martínez S.L. <facturacion@papeleriamartinez.es>',
        subject: 'Factura FV-2026/118 - Papelería Martínez',
        date,
        text: 'Estimado cliente,\n\nAdjuntamos su factura FV-2026/118 correspondiente a su pedido. Gracias por su confianza.\n\nPapelería Martínez S.L.',
        attachment: { fileName: 'FV-2026-118.pdf', contentType: 'application/pdf', content: spanishInvoicePdf() },
      }),
    },
    {
      id: 'fixture-en-receipt',
      raw: mime({
        from: 'Brew & Bean Coffee <receipts@brewandbean.co.uk>',
        subject: 'Your receipt from Brew & Bean',
        date,
        text: 'Thanks for your purchase! Your receipt is attached.',
        attachment: { fileName: 'receipt.png', contentType: 'image/png', content: englishReceiptPng() },
      }),
    },
    {
      id: 'fixture-newsletter',
      raw: mime({
        from: 'Tech Weekly <news@techweekly.example>',
        subject: 'This week in tech: 10 tools you will love',
        date,
        text: 'Hi there! Here are the ten tools everyone is talking about this week. Unsubscribe anytime.',
      }),
    },
    {
      id: 'fixture-shipping',
      raw: mime({
        from: 'Envíos Rápidos <tracking@enviosrapidos.example>',
        subject: 'Tu pedido está en camino',
        date,
        text: 'Hola, tu paquete ha salido del almacén y llegará mañana. Número de seguimiento: ER123456789ES.',
      }),
    },
  ];
}

function mime(props: {
  from: string;
  subject: string;
  date: string;
  text: string;
  attachment?: { fileName: string; contentType: string; content: Buffer };
}): Buffer {
  const boundary = 'finsift-fixture-boundary';
  const headers = [
    `From: ${props.from}`,
    'To: test@finsift.example',
    `Subject: =?UTF-8?B?${Buffer.from(props.subject).toString('base64')}?=`,
    `Date: ${props.date}`,
    'MIME-Version: 1.0',
  ];
  if (!props.attachment) {
    return Buffer.from([...headers, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', props.text].join('\r\n'));
  }
  return Buffer.from(
    [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      props.text,
      `--${boundary}`,
      `Content-Type: ${props.attachment.contentType}; name="${props.attachment.fileName}"`,
      `Content-Disposition: attachment; filename="${props.attachment.fileName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      props.attachment.content.toString('base64').replace(/(.{76})/g, '$1\r\n'),
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  );
}

/**
 * A digital (text-layer) Spanish invoice: 2 lines, base 100,00 €, IVA 21 % 21,00 €,
 * IRPF 15 % -15,00 €, total 106,00 €.
 */
export function spanishInvoicePdf(): Buffer {
  const lines = [
    'PAPELERIA MARTINEZ S.L.  -  NIF B12345678',
    'C/ Mayor 10, 28013 Madrid  -  facturacion@papeleriamartinez.es',
    'FACTURA  N.: FV-2026/118      Fecha de emision: 03/11/2026',
    'Cliente: Estudio Creativo  -  NIF 12345678Z',
    'Descripcion                 Cant.   Precio unit.   Importe',
    'Papel A4 80g (caja)           4         15,00        60,00',
    'Boligrafo azul (pack 10)      2         20,00        40,00',
    'Base imponible: 100,00 EUR',
    'IVA 21%: 21,00 EUR',
    'Retencion IRPF 15%: -15,00 EUR',
    'TOTAL FACTURA: 106,00 EUR',
    'Forma de pago: transferencia bancaria',
  ];
  const content = ['BT', '/F1 11 Tf', '14 TL', '50 780 Td', ...lines.map((line) => `(${line}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** An English receipt as an image: 2 lines, net £10.00, VAT 20 % £2.00, total £12.00. */
export function englishReceiptPng(): Buffer {
  const canvas = createCanvas(600, 520);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 600, 520);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('BREW & BEAN COFFEE', 40, 60);
  ctx.font = '18px sans-serif';
  const lines = [
    '12 Market Street, Bristol BS1 1AA',
    'VAT No: GB123456789',
    'Receipt #R-55821        05/11/2026',
    '',
    '2 x Flat White      @ 3.00      6.00',
    '1 x Banana Bread    @ 4.00      4.00',
    '',
    'Subtotal (excl. VAT)            10.00',
    'VAT 20%                          2.00',
    'TOTAL                          £12.00',
    'Paid by card',
  ];
  lines.forEach((line, index) => ctx.fillText(line, 40, 110 + index * 34));
  return canvas.toBuffer('image/png');
}
