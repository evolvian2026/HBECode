import { defineConfig } from 'vitest/config';
// Decorator metadata needs tsc, so tests run against the compiled output (see test/harness.ts).
export default defineConfig({ test: { include: ['test/*.test.ts'], testTimeout: 30_000, hookTimeout: 120_000, fileParallelism: false } });
