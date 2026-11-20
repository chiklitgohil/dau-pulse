import { seedTaxonomy } from '@/db/seed';
import { openDb } from './_shared';

/** Upsert departments, categories and locations from src/config/taxonomy.ts. */
async function main() {
  const { db, close, kind } = await openDb();
  try {
    await seedTaxonomy(db);
    console.log(`✓ Taxonomy seeded (${kind})`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
