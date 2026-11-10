/** Shared bilingual (English / Spanish) knowledge used by both agents. */
export const BILINGUAL_INVOICE_GLOSSARY = `
## Reading English and Spanish documents
Emails and invoices arrive in English or Spanish (sometimes mixed). Understand both natively and always
report values in the normalized formats required by the tools, never in the document's local format.

| Concept | English | Spanish |
|---|---|---|
| Invoice | Invoice, Tax invoice, Bill | Factura, Factura completa, Factura simplificada, Ticket, Recibo |
| Credit note | Credit note | Factura rectificativa, Abono |
| Invoice number | Invoice no., Invoice #, Number | Nº de factura, Número, Núm., Serie y número |
| Issue date | Invoice date, Date of issue | Fecha de factura, Fecha de emisión, Fecha de expedición |
| Due date | Due date, Payment due | Fecha de vencimiento, Vencimiento |
| Vendor tax id | VAT number, VAT ID, Tax ID, EIN | NIF, CIF, NIF-IVA, VAT |
| Subtotal (net) | Subtotal, Net amount, Amount excl. VAT | Base imponible, Subtotal, Importe neto |
| VAT | VAT, Sales tax, Tax | IVA, Cuota de IVA, Impuestos |
| Equivalence surcharge | — | Recargo de equivalencia (R.E.) — add it to VAT |
| Withholding | Withholding tax | Retención, IRPF (it is SUBTRACTED from the total) |
| Total | Total, Amount due, Total payable | Total, Total factura, Importe total, Total a pagar |
| Quantity | Qty, Quantity, Units | Cantidad, Cant., Uds., Unidades |
| Unit price | Unit price, Rate, Price | Precio unitario, Precio, P.U. |
| Discount | Discount | Descuento, Dto. |
| Line amount | Amount, Line total | Importe, Total línea |
| Payment method | Paid by card, Bank transfer, Direct debit | Tarjeta, Transferencia, Domiciliación, Efectivo |

### Numbers
- Spanish documents write 1.234,56 (dot = thousands, comma = decimals). English documents write 1,234.56.
- Decide the convention from the whole document (e.g. a total of "1.210,00" with VAT "210,00" is Spanish style).
- Tools take amounts as plain decimal strings with "." as decimal separator and no thousands separator:
  "1234.56", "0.29", "-15.00". Never include currency symbols.
- Typical Spanish VAT rates: 21 %, 10 %, 4 % (0 % for exempt). UK: 20 %, 5 %. Report rates as numbers (21, not "21%").

### Dates
- Spanish documents use day/month/year: 03/04/2026 is 3 April 2026. English (US) documents may use month/day/year;
  use the vendor's country and the other dates on the document to disambiguate.
- Tools take ISO dates: YYYY-MM-DD.

### Currency
- Report ISO 4217 codes: € → EUR, $ → USD (unless the document says otherwise), £ → GBP.
`.trim();
