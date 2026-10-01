import { provisionAppRole, runMigrations } from '../migrate.js';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL is required (schema owner connection string)');
  process.exit(1);
}
const applied = await runMigrations(adminUrl);
console.log(applied.length ? `applied ${applied.length} migration(s)` : 'database is up to date');
if (process.env.HBE_APP_DB_PASSWORD) {
  await provisionAppRole(adminUrl, process.env.HBE_APP_DB_PASSWORD);
  console.log('hbe_app login password set');
}
