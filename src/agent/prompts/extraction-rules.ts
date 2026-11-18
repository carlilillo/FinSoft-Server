/** Rules shared by every agent that stores invoices (email extractor and imported-document extractor). */

export const INVOICE_DOCUMENT_FORMATS = `
## Invoice documents: PDFs and images
An invoice or receipt can arrive in any of these formats, and all of them are equally the invoice itself:
- PDF: digital or scanned, one or several pages.
- Image: a phone photo, a scan or a screenshot, as JPEG, PNG, WebP, GIF, HEIC/HEIF (iPhone photos), AVIF, TIFF
  (scanners and faxes, sometimes several pages) or BMP.
- Structured or text invoices: XML (Facturae, UBL), HTML, plain text or CSV.
read_file returns a PDF or an image as the document itself, so you see it as it is; images in formats the model
cannot open directly (HEIC, TIFF, …) are shown as one picture per page. Never try to convert or edit a file.

An image is not a lesser source: it IS the original document and the only source of truth for every value you
store, exactly like a PDF. Read it as carefully as you would read a PDF:
- Photos are often rotated, skewed, folded, creased, shadowed or taken at an angle, and till receipts are often
  faded thermal paper: read them anyway, zooming in mentally on totals, dates and tax ids.
- Store only what you can actually see. Never complete a cut-off, blurred or covered value from context; use null
  for optional fields you cannot read.
- Check the arithmetic (line amounts add up to the subtotal; subtotal + VAT − withholding = total). When a digit is
  ambiguous, the arithmetic decides. If the total itself cannot be read, store nothing and say "FAILED: <reason>".
- One image may show several receipts (store each one), or only part of one. Several images may be the pages of
  the same invoice: store that invoice once, reading every page.
- A picture of a product, a logo, a QR code on its own, a payment-terminal slip without the merchant's items, or a
  screenshot of a chat or a banking app is not an invoice unless it shows the invoice's details.
`.trim();

/** Who issued the invoice and who it bills: the two kinds of invoices a user can analyze. */
export const INVOICE_DIRECTION_RULES = `
## Invoices the user issues and invoices the user receives
Every invoice has two parties: the issuer (seller, who wrote the invoice) and the customer billed (buyer: "Bill to",
"Customer", "Cliente", "Facturar a", "Datos del cliente", "Destinatario"). The user can analyze either kind:
- Invoices the user RECEIVED from providers (their purchases and expenses): the issuer is a provider and the user is
  the customer billed. The counterparty you store is the provider who issued it.
- Invoices the user ISSUED to their own customers (their sales and income): the issuer is the user's business and the
  customer billed is someone else. The counterparty you store is that customer, never the user's own business.
The user's message tells you which kind this session stores; the server records that choice itself, so never store an
invoice of the other kind. If the document is clearly of the other kind, store nothing and say
"NOT_AN_INVOICE: <why>", e.g. "this invoice was issued by you to Acme S.L.; import it with Import your invoices" or
"this is a bill you received from Iberdrola; import it with Import invoices". When the parties are ambiguous (a till
receipt with no customer printed), follow the kind the user chose.
`.trim();

export const SAVE_INVOICE_STEPS = `
1. save_invoice — the counterparty's details (the provider on an invoice the user received, the customer billed on an
   invoice the user issued; null for anything not printed on the document: tax id, address, email, phone, website,
   country), invoice number (null if none, e.g. simple tickets), issue date, due date (or null), currency,
   subtotal (net), VAT (including any recargo de equivalencia), withholding (IRPF, or null), total, payment method
   (or null), language and short notes (or null). It returns an invoiceId.
2. save_invoice_products — every line item with quantity, unit net price, unit gross price (or null), VAT rate
   (or null), discount (or null), line net, line VAT (or null), line gross, SKU/reference (or null) and unit (or null).
   Include shipping, fees and surcharges as their own lines. If a global discount exists, add it as a line with a
   negative net amount. Describe products the way the document does, in its original language.
`.trim();

export const EXTRACTION_OUTCOME_RULES = `
When a tool returns an error, read it carefully, re-check the document and call the tool again with corrected
values (at most two retries per tool). Never invent values: use null for anything that is not on the document.
If the document is not an invoice or receipt, store nothing and say "NOT_AN_INVOICE: <reason>".
If it is an invoice but unreadable, store nothing and say "FAILED: <reason>".
`.trim();

export const EXTRACTION_FINAL_ANSWER = `
## Final answer
Reply with one short line per stored invoice: "<invoiceId> — <counterparty> — <total> <currency> — <n> lines",
or the NOT_AN_INVOICE / FAILED line.
`.trim();
