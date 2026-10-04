import { defineConfig } from 'vitest/config';
// Phase 7: validates the whole seed bank in the real sandbox (Docker + hbe-executor image).
export default defineConfig({ test: { include: ['test/e2e/seed-bank.test.ts'], testTimeout: 3 * 60 * 60_000, hookTimeout: 600_000 } });
