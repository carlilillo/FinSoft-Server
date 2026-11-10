import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service.js';
import { buildDataSourceOptions } from './data-source.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions(config.get('POSTGRESQL_URL')),
        autoLoadEntities: true,
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
