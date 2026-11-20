import { defineConfig } from 'drizzle-kit';

// Used only for generating SQL migrations from src/db/schema.ts (`npm run db:generate`).
// Migrations are applied by scripts/migrate.ts (Postgres) or automatically on startup (PGlite).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
});
