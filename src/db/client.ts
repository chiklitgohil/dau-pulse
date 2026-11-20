import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { seedTaxonomy } from './seed';

export type Schema = typeof schema;
/** Driver-agnostic database handle. Transactions are assignable to it too. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

const migrationsFolder = path.join(process.cwd(), 'drizzle');

/** Embedded Postgres (PGlite) with pgvector. `dataDir` undefined = in-memory (tests). */
export async function createPgliteDb(dataDir?: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const client = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

/** A real Postgres server. Migrations are applied separately (`npm run db:migrate`). */
export async function createPostgresDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  // prepare:false keeps it compatible with transaction-mode poolers (Supabase, Neon, PgBouncer).
  const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  const db = drizzle(client, { schema });
  return { db: db as unknown as Db, close: () => client.end() };
}

export async function migratePostgres(url: string) {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

const globalForDb = globalThis as unknown as { __dauPulseDb?: Promise<Db> };

/**
 * App-wide database. Uses DATABASE_URL when set; otherwise (dev only) an embedded Postgres in
 * ./.data/pglite that migrates and seeds itself, so `npm run dev` works with zero setup.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__dauPulseDb) {
    globalForDb.__dauPulseDb = (async () => {
      const url = process.env.DATABASE_URL;
      if (url) return (await createPostgresDb(url)).db;
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PGLITE_IN_PRODUCTION !== 'true') {
        throw new Error('DATABASE_URL is required in production.');
      }
      const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
      const { db } = await createPgliteDb(dir);
      await seedTaxonomy(db, { onlyIfEmpty: true });
      return db;
    })().catch((err) => {
      globalForDb.__dauPulseDb = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return globalForDb.__dauPulseDb;
}
