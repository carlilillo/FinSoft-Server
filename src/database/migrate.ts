import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options.js';
import { runPendingMigrations } from './run-migrations.js';

/**
 * Applies pending migrations and exits: 0 when the schema is up to date, 1 on failure (nothing is
 * left half-applied: all pending migrations run in one transaction). Meant as the release / pre-deploy
 * step of a cloud deployment, before new app instances start:
 *
 *   node dist/database/migrate.js        (POSTGRESQL_URL from the environment)
 *   pnpm migration:run                   (locally, also reads .env when present)
 */
async function main(): Promise<void> {
  const url = process.env.POSTGRESQL_URL;
  if (!url) throw new Error('POSTGRESQL_URL is not set');

  const dataSource = new DataSource({ ...buildDataSourceOptions(url), logging: ['error', 'warn', 'migration'] });
  await dataSource.initialize();
  try {
    const applied = await runPendingMigrations(dataSource);
    console.log(
      applied.length === 0
        ? 'Database schema is up to date; no migrations to run.'
        : `Applied ${applied.length} migration(s): ${applied.join(', ')}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed; no changes were applied.', error);
  process.exitCode = 1;
});
