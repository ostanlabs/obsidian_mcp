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
      // Exclude native module tests that have threading issues when run in parallel
      // These tests pass when run in isolation but crash with V8 threading errors
      // when run alongside other tests due to faiss-node and hnswlib-node
      'md_retriever/src/vector/__tests__/faiss-shard-index.test.ts',
      'md_retriever/src/vector/__tests__/hnsw-outline-index.test.ts',
    ],
    // Run tests sequentially to avoid native module threading issues
    // This is slower but more reliable with native modules
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});

