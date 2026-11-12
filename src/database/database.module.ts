import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { AppConfigService } from '../config/app-config.service.js';
import { buildDataSourceOptions } from './data-source.options.js';
import { runPendingMigrations } from './run-migrations.js';

/** The app's options, plus whether this instance applies pending migrations before it serves anything. */
type AppDataSourceOptions = DataSourceOptions & { migrateOnBoot?: boolean };

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions(config.get('POSTGRESQL_URL')),
        autoLoadEntities: true,
        migrateOnBoot: config.get('DATABASE_MIGRATE_ON_BOOT'),
      }),
      // Migrations run here, before any other module touches the database, and under the same lock as
      // the `migration:run` release step (TypeORM's own `migrationsRun` takes no lock).
      dataSourceFactory: async (options) => {
        const { migrateOnBoot, ...dataSourceOptions } = options as AppDataSourceOptions;
        const dataSource = await new DataSource(dataSourceOptions).initialize();
        if (migrateOnBoot) {
          const applied = await runPendingMigrations(dataSource);
          if (applied.length > 0) new Logger('Database').log(`Applied migrations: ${applied.join(', ')}`);
        }
        return dataSource;
      },
    }),
  ],
})
export class DatabaseModule {}
