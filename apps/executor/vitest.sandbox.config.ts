import { defineConfig } from 'vitest/config';
// Requires Docker and the hbe-executor image (see apps/executor/README.md).
export default defineConfig({ test: { include: ['test/sandbox/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 300_000, fileParallelism: false } });
