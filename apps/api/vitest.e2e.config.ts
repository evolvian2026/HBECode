import { defineConfig } from 'vitest/config';
// Requires Docker + the hbe-executor image: runs real code through the real sandbox.
// The seed bank has its own config (vitest.bank.config.ts): it takes several minutes.
export default defineConfig({ test: { include: ['test/e2e/*.test.ts'], exclude: ['test/e2e/seed-bank.test.ts'], testTimeout: 300_000, hookTimeout: 300_000, fileParallelism: false } });
