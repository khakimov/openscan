import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
    // Testcontainers needs more time to spin up Docker containers
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
