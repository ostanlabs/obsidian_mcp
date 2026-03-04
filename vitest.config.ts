import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'md_retriever/src/**/__tests__/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
    ],
    // Use 'forks' pool to isolate tests in separate processes
    // This prevents V8 threading issues with native modules (faiss-node, hnswlib-node)
    pool: 'forks',
    poolOptions: {
      forks: {
        // Run tests sequentially in a single fork to avoid native module conflicts
        singleFork: true,
        // Isolate each test file in its own process for native module safety
        isolate: true,
      },
    },
    // Increase timeouts for tests that load native modules
    testTimeout: 30000,
    hookTimeout: 60000,
    // Disable file parallelism to prevent concurrent native module access
    fileParallelism: false,
  },
});

