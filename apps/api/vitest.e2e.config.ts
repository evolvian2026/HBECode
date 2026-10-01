import { defineConfig } from 'vitest/config';
// Requires Docker + the hbe-executor image: runs real code through the real sandbox.
export default defineConfig({ test: { include: ['test/e2e/*.test.ts'], testTimeout: 300_000, hookTimeout: 300_000, fileParallelism: false } });
