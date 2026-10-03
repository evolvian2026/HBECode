import { defineConfig } from 'vitest/config';
// Seeds a large dataset and times the report endpoints (Phase 6 exit criterion). Postgres + Redis.
export default defineConfig({ test: { include: ['test/perf/*.test.ts'], testTimeout: 600_000, hookTimeout: 900_000, fileParallelism: false } });
