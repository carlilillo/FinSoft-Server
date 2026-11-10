import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options.js';

/** Used by the TypeORM CLI (`pnpm migration:run`, `pnpm migration:generate`). */
const url = process.env.POSTGRESQL_URL;
if (!url) throw new Error('POSTGRESQL_URL is not set');

export default new DataSource(buildDataSourceOptions(url));
