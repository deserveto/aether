import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/__tests__/**/*.test.ts', 'apps/**/src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@aether/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
})
