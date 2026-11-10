/** Rules shared by every agent that stores invoices (email extractor and imported-document extractor). */

export const SAVE_INVOICE_STEPS = `
1. save_invoice — vendor details (null for anything not printed on the document: tax id, address, email, phone,
   website, country), invoice number (null if none, e.g. simple tickets), issue date, due date (or null), currency,
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
Reply with one short line per stored invoice: "<invoiceId> — <vendor> — <total> <currency> — <n> lines",
or the NOT_AN_INVOICE / FAILED line.
`.trim();
