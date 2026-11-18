import { IsDateString, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { INVOICE_DIRECTIONS, type InvoiceDirection } from '../domain/invoice-direction.js';

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Only invoices the user issued, or only those received from providers; omitted, both. */
  @IsOptional()
  @IsIn(INVOICE_DIRECTIONS)
  direction?: InvoiceDirection;

  @IsOptional()
  @IsString()
  @Length(26, 26)
  vendorId?: string;

  @IsOptional()
  @IsString()
  @Length(26, 26)
  runId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
