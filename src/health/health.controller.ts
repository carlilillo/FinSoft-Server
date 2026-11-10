import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/auth/public.decorator.js';
import { StorageService } from '../storage/storage.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, storage] = await Promise.all([
      this.dataSource.query('SELECT 1').then(
        () => true,
        () => false,
      ),
      this.storage.isReachable(),
    ]);
    const status = { database, storage };
    if (!database || !storage) throw new ServiceUnavailableException({ status: 'degraded', ...status });
    return { status: 'ok', ...status };
  }
}
