import type { DataSource } from 'typeorm';

/**
 * Session-level Postgres advisory lock held while migrating. Every process that migrates (each app
 * replica on boot, the `migration:run` release step) takes it first, so concurrent deploys wait for
 * each other instead of running the same migration twice; the later ones then find nothing pending.
 */
const MIGRATION_LOCK_KEY = 'finsift:schema-migrations';

/** Runs every pending migration in one transaction (all or nothing) and returns the names applied. */
export async function runPendingMigrations(dataSource: DataSource): Promise<string[]> {
  // A dedicated connection: an advisory lock belongs to the session that took it.
  const lock = dataSource.createQueryRunner();
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    return applied.map((migration) => migration.name);
  } finally {
    await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await lock.release();
  }
}
