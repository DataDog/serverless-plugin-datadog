import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    // Cloud round-trips are slow; defaults are overridden per test/hook too.
    testTimeout: 600_000,
    hookTimeout: 900_000,
    // The lifecycle tests share deployed state and must run in declared order.
    fileParallelism: false,
    pool: 'forks',
    // Loads e2e/.env.local for local runs (no-op in CI, real env wins).
    setupFiles: ['./load-env.ts'],
  },
});
