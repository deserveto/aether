import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/__tests__/**/*.test.ts', 'apps/**/src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
  },
  resolve: {
    alias: {
      '@aether/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
})
