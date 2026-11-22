import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Stopping embedded Postgres on Windows can take >10s under load.
    teardownTimeout: 60_000,
  },
});
