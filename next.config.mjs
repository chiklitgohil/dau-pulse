/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime,
  // and the Postgres driver should not be bundled either.
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'postgres'],
  poweredByHeader: false,
};

export default nextConfig;
