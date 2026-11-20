import path from 'node:path';
import nextEnv from '@next/env';
import { createPgliteDb, createPostgresDb, type Db } from '@/db/client';

// Same .env / .env.local precedence as `next dev`.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

/** Open the app database: DATABASE_URL if set, otherwise the local PGlite in ./.data/pglite. */
export async function openDb(): Promise<{ db: Db; close: () => Promise<void>; kind: 'postgres' | 'pglite' }> {
  const url = process.env.DATABASE_URL;
  if (url) return { ...(await createPostgresDb(url)), kind: 'postgres' };
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  try {
    return { ...(await createPgliteDb(dir)), kind: 'pglite' };
  } catch (err) {
    console.error(`Could not open the local database in ${dir}. Is \`npm run dev\` running? Stop it first.`);
    throw err;
  }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}
