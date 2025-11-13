import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./src/test-shims/cloudflare-workers.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    setupFiles: ['./src/test/integration-setup.ts'],
    // Run test files sequentially to avoid SQLite lock conflicts
    fileParallelism: false,
  },
});
