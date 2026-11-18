import { IsIn, IsOptional } from 'class-validator';
import { INVOICE_DIRECTIONS, type InvoiceDirection } from '../domain/invoice-direction.js';

/** Optional `?direction=issued|received` filter; omitted, both kinds are listed. */
export class DirectionFilterQueryDto {
  @IsOptional()
  @IsIn(INVOICE_DIRECTIONS)
  direction?: InvoiceDirection;
}
