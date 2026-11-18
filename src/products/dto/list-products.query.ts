import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { INVOICE_DIRECTIONS, type InvoiceDirection } from '../../invoices/domain/invoice-direction.js';

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Only products the user sells (`issued`) or buys (`received`); omitted, both. */
  @IsOptional()
  @IsIn(INVOICE_DIRECTIONS)
  direction?: InvoiceDirection;
}
