import { IsIn, IsOptional } from 'class-validator';
import { INVOICE_DIRECTIONS, type InvoiceDirection } from '../domain/invoice-direction.js';

/**
 * The kind of invoices the user is importing (from the computer or through a phone link): invoices they issued to
 * their customers, or invoices they received from providers. Omitted, it means received, as before.
 */
export class ImportDirectionDto {
  @IsOptional()
  @IsIn(INVOICE_DIRECTIONS)
  direction: InvoiceDirection = 'received';
}
