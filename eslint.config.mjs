// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/.mastra/**',
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      // Vendored third-party file kept verbatim from zod 4.4.3 (applied via postinstall).
      'patches/**',
      // Next.js-generated, not edited by us.
      '**/next-env.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (postinstall hooks, etc.) need Node globals.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettierConfig,
)
