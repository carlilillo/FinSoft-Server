import { Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '../common/dto/pagination.dto.js';
import type { ListProductsQueryDto } from './dto/list-products.query.js';
import { type ProductSummaryRow, ProductsRepository } from './products.repository.js';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  async list(userId: string, query: ListProductsQueryDto): Promise<Page<ProductSummaryRow>> {
    const [items, total] = await this.products.list(userId, query.search, query.page, query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(userId: string, productId: string) {
    const product = await this.products.findSummary(userId, productId);
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    return { ...product, priceHistory: await this.products.priceHistory(userId, productId) };
  }
}
