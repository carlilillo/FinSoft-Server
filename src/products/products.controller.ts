import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { UlidPipe } from '../common/pipes/ulid.pipe.js';
import { ListProductsQueryDto } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@CurrentUser() auth: AuthContext, @Query() query: ListProductsQueryDto) {
    return this.productsService.list(auth.userId, query);
  }

  @Get(':id')
  detail(@CurrentUser() auth: AuthContext, @Param('id', UlidPipe) id: string) {
    return this.productsService.detail(auth.userId, id);
  }
}
