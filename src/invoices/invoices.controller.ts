import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.js';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext, @Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(auth.userId, query);
  }

  @Get(':id')
  detail(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.invoicesService.detail(auth.userId, id);
  }
}
