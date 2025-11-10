import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixtures/**'],
    setupFiles: ['./vitest.setup.ts'],
    // Run test files sequentially to avoid SQLite lock conflicts
    fileParallelism: false,
  },
});
