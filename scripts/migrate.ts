import { migratePostgres } from '@/db/client';
import { openDb } from './_shared';

/** Apply SQL migrations in ./drizzle. Safe to run repeatedly. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    await migratePostgres(url);
    console.log('✓ Postgres migrated');
    return;
  }
  const { close } = await openDb(); // PGlite migrates on open
  await close();
  console.log('✓ Local PGlite database migrated (./.data/pglite)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
