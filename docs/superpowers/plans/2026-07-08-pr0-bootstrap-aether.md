# PR-0 Bootstrap Aether — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a fresh npm-workspace monorepo with a minimal Next.js 16 web shell and a Mastra agent server (zero agents) on LibSQL, plus CI, lint/format, and docs — no product features.

**Architecture:** Two apps (`apps/web`, `apps/agent-server`) plus one shared package (`packages/shared`). Root owns tooling (TypeScript strict, ESLint flat config, Prettier, Vitest). Agent server uses Mastra's native Hono-based server with a custom `/health` route and strict CORS middleware. Web renders a Swiss-style shell (Tailwind v4 + DESIGN.md tokens) with a health badge that polls the agent server.

**Tech Stack:** Node ≥ 22.13 (target 22.18), npm workspaces, TypeScript strict (ES2022 / bundler), Mastra 1.50.x + `@mastra/libsql`, Next.js 16, React 19, Tailwind v4, Zod 4, pino, ESLint 10 + typescript-eslint, Prettier 3, Vitest 4, lucide-react, Docker Compose, GitHub Actions.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-07-08-pr0-bootstrap-aether-design.md`:

- Node.js >= 22.13 (target 22.18+).
- npm workspaces, single root lockfile.
- TypeScript strict, `target: ES2022`, `moduleResolution: bundler`; no CommonJS / `node` resolver.
- Mastra native server (`mastra dev` / `mastra build`), default port 4111.
- Storage: `@mastra/libsql`, file-backed `file:./mastra.db`.
- Zod 4 for env validation.
- No `@ts-ignore`. No disabling strict mode. No global ESLint suppression to hide errors. No committed secrets. No fake API responses. No arbitrary `any` outside isolated external boundaries.
- No implementation outside PR-0 scope (no providers, agents, tools, chat, catalog, builder, search, fetch, maestro).
- No agent packages / provider packages / tool packages / database package / agent-builder package in PR-0.
- Zero Mastra agents registered. Fallback only if `mastra dev`/`mastra build` refuse to boot with zero agents (then one clearly-named `dev-bootstrap-agent`, documented as development-only).
- `DESIGN.md` rule: no pure `#000000` — use off-black `#0A0A0A` for `--color-primary`.
- Branch: `chore/bootstrap-aether`. Do not modify `main`.

---

## File Structure

**Root (tooling):**
- `package.json` — workspaces, root scripts, shared devDeps
- `tsconfig.base.json` — strict shared compiler options
- `tsconfig.json` — root solution-style project references
- `eslint.config.mjs` — flat config base
- `.prettierrc.json`, `.prettierignore` — formatter
- `.editorconfig`, `.gitignore`, `.env.example` — repo hygiene
- `vitest.config.ts` — workspace-aware test runner

**packages/shared (`@aether/shared`):**
- `package.json`, `tsconfig.json`, `eslint.config.mjs`
- `src/index.ts` — barrel
- `src/errors.ts` — `AppError`, `ErrorCode`
- `src/health.ts` — `HealthStatus`, `HealthResponse`, `ComponentHealth`
- `src/env-types.ts` — `AppEnv`, `LogLevel`
- `src/log-context.ts` — `BaseLogContext`
- `src/__tests__/errors.test.ts` — TDD for errors

**apps/agent-server (`@aether/agent-server`):**
- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.env.example`
- `src/index.ts` — re-export mastra entry
- `src/config/env.ts` — Zod-validated typed `env`
- `src/config/logger.ts` — pino factory `createLogger`
- `src/config/cors.ts` — `corsMiddleware` Hono middleware
- `src/config/middleware.ts` — `requestIdInjector`, `requestLogger`
- `src/mastra/routes/health.ts` — `/health` route
- `src/mastra/index.ts` — `Mastra` instance (zero agents)
- `src/__tests__/env.test.ts` — TDD for env schema

**apps/web (`@aether/web`):**
- `package.json`, `tsconfig.json`, `eslint.config.mjs`
- `next.config.ts`, `postcss.config.mjs`
- `src/env.ts`, `src/lib/config.ts`, `src/lib/api-client.ts`
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- `src/components/shell.tsx`, `src/components/health-badge.tsx`

**infra:**
- `infra/searxng/docker-compose.yml` — SearXNG placeholder

**CI + docs:**
- `.github/workflows/ci.yml`
- `README.md` (rewrite), `AGENTS.md` (update)

---

## Task 1: Root workspace + tooling configs

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `.env.example`, `eslint.config.mjs`, `vitest.config.ts`

**Interfaces:**
- Produces: npm workspace root; root scripts (`dev`, `dev:web`, `dev:agent`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`); base tsconfig consumed by all packages via `extends`; flat ESLint config reused via `@aether/eslint-config` import path.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "aether",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22.13" },
  "scripts": {
    "dev": "concurrently -n web,agent -c magenta,green \"npm:dev:web\" \"npm:dev:agent\"",
    "dev:web": "npm run dev --workspace @aether/web",
    "dev:agent": "npm run dev --workspace @aether/agent-server",
    "build": "npm run build --workspace @aether/web --if-present && npm run build --workspace @aether/agent-server --if-present",
    "typecheck": "tsc -b",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "concurrently": "^10.0.0",
    "eslint": "^10.0.0",
    "eslint-config-prettier": "^10.0.0",
    "globals": "^16.0.0",
    "prettier": "^3.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.60.0",
    "vitest": "^4.0.0"
  }
}
```

> Note: TS pinned to `^5.9` (not 6.x) for typescript-eslint 8 compatibility. If `npm install` resolves a conflict, prefer typescript-eslint's supported TS range.

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "paths": {
      "@aether/shared": ["./packages/shared/src/index.ts"],
      "@aether/shared/*": ["./packages/shared/src/*"]
    }
  }
}
```

- [ ] **Step 3: Create root `tsconfig.json` (solution references)**

```json
{
  "files": [],
  "references": [
    { "path": "./packages/shared" },
    { "path": "./apps/agent-server" },
    { "path": "./apps/web" }
  ]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.next/
.mastra/
dist/
build/
out/
*.db
*.db-journal
.env
.env.local
.env.*.local
coverage/
.vitest-cache/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 5: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Create `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 7: Create `.prettierignore`**

```
.next/
.mastra/
dist/
build/
node_modules/
package-lock.json
*.db
docs/AETHER_FOUNDATION.md
```

- [ ] **Step 8: Create root `.env.example`**

```
# Aether environment (PR-0). Copy relevant subset into apps/agent-server/.env.
# No provider API keys in this PR — those arrive in PR-1.

# Application
NODE_ENV=development

# Web app (apps/web)
WEB_URL=http://localhost:3000
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:4111

# Agent server (apps/agent-server)
AGENT_SERVER_URL=http://localhost:4111
AGENT_SERVER_PORT=4111
AGENT_SERVER_HOST=localhost

# Storage (local LibSQL file)
DATABASE_URL=file:./mastra.db

# Logging
LOG_LEVEL=info

# Infrastructure placeholder (consumed in PR-4)
SEARXNG_URL=http://localhost:8080

# Custom-endpoint dev bypass (consumed in PR-1)
ALLOW_LOCAL_ENDPOINTS=false
```

- [ ] **Step 9: Create root `eslint.config.mjs`**

```js
// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/.next/**', '**/.mastra/**', '**/dist/**', '**/build/**', '**/node_modules/**', '**/coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
)
```

> If `@eslint/js` is not auto-resolved by eslint 10, add it explicitly in Step 11's install. Run `npm view @eslint/js version` and add `"@eslint/js": "^19.0.0"` to root devDependencies if the lint step in Task 9 fails.

- [ ] **Step 10: Create `vitest.config.ts`**

```ts
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
```

- [ ] **Step 11: Install root devDependencies**

Run: `npm install`
Expected: install completes; `package-lock.json` created; no peer-dep errors blocking (warnings acceptable).

- [ ] **Step 12: Verify root tooling**

Run: `npm run format:check`
Expected: exits 0 (or lists only files not yet formatted — acceptable since no source exists yet).

Run: `npm run lint`
Expected: exits 0 (no files to lint yet).

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.base.json .gitignore .editorconfig .prettierrc.json .prettierignore .env.example eslint.config.mjs vitest.config.ts
git commit -m "chore: bootstrap npm workspace and root tooling"
```

---

## Task 2: `packages/shared` (`@aether/shared`)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/eslint.config.mjs`
- Create: `packages/shared/src/index.ts`, `src/errors.ts`, `src/health.ts`, `src/env-types.ts`, `src/log-context.ts`
- Test: `packages/shared/src/__tests__/errors.test.ts`

**Interfaces:**
- Produces: `@aether/shared` exports — `AppError` (class), `ErrorCode` (const + type), `AppErrorDetails`, `HealthStatus`, `HealthResponse`, `ComponentHealth`, `AppEnv`, `LogLevel`, `BaseLogContext`.
- Consumes: nothing (leaf package).

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@aether/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "composite": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/eslint.config.mjs`**

```js
// @ts-check
import base from '../../eslint.config.mjs'

export default base
```

- [ ] **Step 4: Write the failing test `src/__tests__/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { AppError, ErrorCode } from '../errors.js'

describe('AppError', () => {
  it('carries code, message, retryable, and details', () => {
    const err = new AppError({
      code: ErrorCode.NOT_CONFIGURED,
      message: 'DATABASE_URL is missing',
      retryable: false,
      details: { field: 'DATABASE_URL' },
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AppError')
    expect(err.code).toBe('NOT_CONFIGURED')
    expect(err.message).toBe('DATABASE_URL is missing')
    expect(err.retryable).toBe(false)
    expect(err.details).toEqual({ field: 'DATABASE_URL' })
  })

  it('defaults retryable to false', () => {
    const err = new AppError({ code: ErrorCode.INTERNAL, message: 'boom' })
    expect(err.retryable).toBe(false)
    expect(err.details).toBeUndefined()
  })

  it('preserves a cause', () => {
    const cause = new Error('root')
    const err = new AppError({ code: ErrorCode.NETWORK_ERROR, message: 'upstream', cause })
    // @ts-expect-error - cause is standard but not in older lib typings path
    expect(err.cause).toBe(cause)
  })
})

describe('ErrorCode', () => {
  it('contains the stable codes from TOOL_CONTRACT', () => {
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(ErrorCode.NOT_CONFIGURED).toBe('NOT_CONFIGURED')
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT')
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED')
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    expect(ErrorCode.UNSUPPORTED_CONTENT).toBe('UNSUPPORTED_CONTENT')
    expect(ErrorCode.DEVICE_NOT_FOUND).toBe('DEVICE_NOT_FOUND')
    expect(ErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED')
    expect(ErrorCode.INTERNAL).toBe('INTERNAL')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/shared`
Expected: FAIL — `Cannot find module '../errors.js'` (file not created yet).

- [ ] **Step 6: Implement `src/errors.ts`**

```ts
export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNSUPPORTED_CONTENT: 'UNSUPPORTED_CONTENT',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  COMMAND_FAILED: 'COMMAND_FAILED',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface AppErrorDetails {
  readonly [key: string]: unknown
}

export interface AppErrorInput {
  readonly code: ErrorCode
  readonly message: string
  readonly retryable?: boolean
  readonly details?: AppErrorDetails
  readonly cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly details?: AppErrorDetails

  constructor(input: AppErrorInput) {
    super(input.message, { cause: input.cause })
    this.name = 'AppError'
    this.code = input.code
    this.retryable = input.retryable ?? false
    if (input.details !== undefined) {
      this.details = input.details
    }
  }
}
```

- [ ] **Step 7: Implement `src/health.ts`**

```ts
export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthResponse {
  readonly status: HealthStatus
  readonly service: string
  readonly version: string
  readonly timestamp: string
}

export interface ComponentHealth {
  readonly name: string
  readonly status: HealthStatus
  readonly latencyMs?: number
  readonly error?: string
}
```

- [ ] **Step 8: Implement `src/env-types.ts`**

```ts
export type AppEnv = 'development' | 'test' | 'production'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
```

- [ ] **Step 9: Implement `src/log-context.ts`**

```ts
export interface BaseLogContext {
  readonly requestId?: string
  readonly agentId?: string
  readonly conversationId?: string
  readonly userId?: string
}
```

- [ ] **Step 10: Implement `src/index.ts` barrel**

```ts
export * from './errors.js'
export * from './health.js'
export * from './env-types.js'
export * from './log-context.js'
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run packages/shared`
Expected: PASS — 4 tests.

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck --workspace @aether/shared`
Expected: 0 errors. If `tsc -b` at root complains about missing references for not-yet-created apps, run the workspace-local typecheck directly.

- [ ] **Step 13: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add AppError, health, env, and log-context types"
```

---

## Task 3: `apps/agent-server` env + logger + middleware

**Files:**
- Create: `apps/agent-server/package.json`, `apps/agent-server/tsconfig.json`, `apps/agent-server/eslint.config.mjs`, `apps/agent-server/.env.example`
- Create: `apps/agent-server/src/config/env.ts`, `src/config/logger.ts`, `src/config/cors.ts`, `src/config/middleware.ts`
- Test: `apps/agent-server/src/__tests__/env.test.ts`

**Interfaces:**
- Consumes: `@aether/shared` (`AppError`, `ErrorCode`, `AppEnv`, `LogLevel`).
- Produces: `env` (typed validated object with `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, `LOG_LEVEL`, `WEB_URL`, `AGENT_SERVER_URL`, `ALLOW_LOCAL_ENDPOINTS`); `createLogger()` returning a pino `Logger`; `corsMiddleware`, `requestIdInjector`, `requestLogger` Hono-style middleware (shaped as `(c, next) => Promise<void | Response>`).

- [ ] **Step 1: Create `apps/agent-server/package.json`**

```json
{
  "name": "@aether/agent-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build",
    "start": "node .mastra/index.mjs",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@aether/shared": "*",
    "@mastra/core": "^1.50.0",
    "@mastra/libsql": "^1.15.0",
    "pino": "^10.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "mastra": "^1.18.0",
    "@types/node": "^22.10.0",
    "vitest": "^4.0.0"
  }
}
```

> The `start` script points at `.mastra/index.mjs`. If `mastra build` emits a different entry filename, update this script during Task 4 verification. The default `mastra dev` does not use it.

- [ ] **Step 2: Create `apps/agent-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "composite": true,
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 3: Create `apps/agent-server/eslint.config.mjs`**

```js
// @ts-check
import base from '../../eslint.config.mjs'

export default base
```

- [ ] **Step 4: Create `apps/agent-server/.env.example`**

```
NODE_ENV=development
PORT=4111
HOST=localhost
DATABASE_URL=file:./mastra.db
LOG_LEVEL=info
WEB_URL=http://localhost:3000
ALLOW_LOCAL_ENDPOINTS=false
```

- [ ] **Step 5: Write the failing test `src/__tests__/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { envSchema } from '../config/env.js'

const validBase = {
  NODE_ENV: 'development',
  PORT: '4111',
  HOST: 'localhost',
  DATABASE_URL: 'file:./mastra.db',
  LOG_LEVEL: 'info',
  WEB_URL: 'http://localhost:3000',
  ALLOW_LOCAL_ENDPOINTS: 'false',
} as const

describe('envSchema', () => {
  it('accepts a complete valid environment', () => {
    const parsed = envSchema.parse(validBase)
    expect(parsed.NODE_ENV).toBe('development')
    expect(parsed.PORT).toBe(4111)
    expect(parsed.DATABASE_URL).toBe('file:./mastra.db')
  })

  it('rejects an invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'staging' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty DATABASE_URL', () => {
    const result = envSchema.safeParse({ ...validBase, DATABASE_URL: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid LOG_LEVEL', () => {
    const result = envSchema.safeParse({ ...validBase, LOG_LEVEL: 'verbose' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid WEB_URL', () => {
    const result = envSchema.safeParse({ ...validBase, WEB_URL: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('aggregates multiple errors', () => {
    const result = envSchema.safeParse({
      ...validBase,
      NODE_ENV: 'staging',
      LOG_LEVEL: 'verbose',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('NODE_ENV')
      expect(paths).toContain('LOG_LEVEL')
    }
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run apps/agent-server`
Expected: FAIL — `Cannot find module '../config/env.js'`.

- [ ] **Step 7: Implement `src/config/env.ts`**

```ts
import { z } from 'zod'
import type { AppEnv, LogLevel } from '@aether/shared'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().max(65535),
  HOST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  WEB_URL: z.string().url(),
  ALLOW_LOCAL_ENDPOINTS: z.coerce.boolean().default(false),
})

export type Env = {
  readonly NODE_ENV: AppEnv
  readonly PORT: number
  readonly HOST: string
  readonly DATABASE_URL: string
  readonly LOG_LEVEL: LogLevel
  readonly WEB_URL: string
  readonly ALLOW_LOCAL_ENDPOINTS: boolean
}

export type RawEnv = Record<string, string | undefined>

export function parseEnv(raw: RawEnv, source = 'process.env'): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    // Defer the AppError import to avoid a circular type-only edge at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    throw new Error(
      `[${source}] Invalid environment:\n${issues}\nFix the values in apps/agent-server/.env`,
    )
  }
  return result.data as Env
}

export const env: Env = parseEnv(process.env)
```

> Rationale for throwing a plain `Error` in `parseEnv` (not `AppError`): the env layer must not import the runtime error shape at parse time when even module loading can fail. The bootstrap entry (Task 4) wraps this in a clean shutdown. The `AppError` shape is reserved for in-request failures where it is meaningful to clients.

- [ ] **Step 8: Implement `src/config/logger.ts`**

```ts
import pino, { type Logger } from 'pino'
import { env } from './env.js'

export function createLogger(name = 'agent-server'): Logger {
  return pino({
    name,
    level: env.LOG_LEVEL,
    redact: {
      paths: ['*.key', '*.secret', '*.token', '*.apiKey', 'authorization', '*.password'],
      censor: '[REDACTED]',
    },
    base: { service: 'agent-server', env: env.NODE_ENV },
  })
}

export type { Logger }
```

- [ ] **Step 9: Implement `src/config/cors.ts`**

```ts
import { env } from './env.js'

type HonoContext = {
  req: {
    method: string
    header(name: string): string | undefined
    url: string
  }
  header(name: string, value: string): void
}

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const ALLOWED_HEADERS = 'Content-Type, Authorization'

export function corsMiddleware() {
  const allowed = new URL(env.WEB_URL).origin

  return async (c: HonoContext, next: () => Promise<unknown>): Promise<Response | void> => {
    const origin = c.req.header('Origin')
    if (origin === allowed) {
      c.header('Access-Control-Allow-Origin', allowed)
      c.header('Access-Control-Allow-Methods', ALLOWED_METHODS)
      c.header('Access-Control-Allow-Headers', ALLOWED_HEADERS)
      c.header('Vary', 'Origin')
    }
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }
    await next()
    return undefined
  }
}
```

> In production, `env.NODE_ENV === 'production'` and the allowlist is a single origin — never a wildcard. If multiple origins are needed later, expand `allowed` into a set; the spec only requires strict (non-wildcard) CORS.

- [ ] **Step 10: Implement `src/config/middleware.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { createLogger } from './logger.js'

type HonoContext = {
  req: {
    method: string
    url: string
    header(name: string): string | undefined
  }
  header(name: string, value: string): void
  set(key: string, value: unknown): void
}

const logger = createLogger('http')

export async function requestIdInjector(
  c: HonoContext,
  next: () => Promise<unknown>,
): Promise<void> {
  const incoming = c.req.header('x-request-id')
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID()
  c.set('requestId', requestId)
  c.header('x-request-id', requestId)
  await next()
}

export async function requestLogger(
  c: HonoContext,
  next: () => Promise<unknown>,
): Promise<void> {
  const start = Date.now()
  await next()
  const durationMs = Date.now() - start
  logger.info({ method: c.req.method, url: c.req.url, durationMs }, 'request')
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run apps/agent-server`
Expected: PASS — 6 tests.

> Note: importing `src/config/env.ts` at module load runs `parseEnv(process.env)` against the real environment. The test file only imports `envSchema`, not `env`, so this is safe. If the dev shell lacks `WEB_URL`/`DATABASE_URL` etc., set them temporarily (see Task 5 `.env`) before running the server in later tasks.

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck --workspace @aether/agent-server`
Expected: 0 errors. If `@mastra/*` types are missing, run `npm install` first to materialize workspace deps.

- [ ] **Step 13: Commit**

```bash
git add apps/agent-server/package.json apps/agent-server/tsconfig.json apps/agent-server/eslint.config.mjs apps/agent-server/.env.example apps/agent-server/src
git commit -m "feat(agent-server): add env validation, pino logger, and CORS/request middleware"
```

---

## Task 4: `apps/agent-server` Mastra instance + `/health` route

**Files:**
- Create: `apps/agent-server/src/mastra/routes/health.ts`, `apps/agent-server/src/mastra/index.ts`, `apps/agent-server/src/index.ts`

**Interfaces:**
- Consumes: `@aether/shared` (`HealthResponse`), `@mastra/core`, `@mastra/libsql`, local config.
- Produces: `export const mastra: Mastra` with storage, server config, `/health` route, and three middleware. Zero agents.

- [ ] **Step 1: Implement `src/mastra/routes/health.ts`**

```ts
import { registerApiRoute } from '@mastra/core/server'
import type { HealthResponse } from '@aether/shared'

const SERVICE = 'agent-server'
const VERSION = '0.0.0'

export const healthRoute = registerApiRoute('/health', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'Service health',
    description: 'Returns the agent-server health status.',
    tags: ['system'],
    responses: {
      200: { description: 'Service is healthy' },
      503: { description: 'Service is degraded; storage unavailable' },
    },
  },
  handler: async (c) => {
    const mastra = c.get('mastra')
    const storage = mastra.getStorage()
    const timestamp = new Date().toISOString()

    if (!storage) {
      const body: HealthResponse = {
        status: 'degraded',
        service: SERVICE,
        version: VERSION,
        timestamp,
      }
      return c.json(body, 503)
    }

    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE,
      version: VERSION,
      timestamp,
    }
    return c.json(body, 200)
  },
})
```

> A round-trip storage ping is deferred to a later PR. For PR-0 the check is "storage was configured at boot" — a real signal that the LibSQL store instantiated without throwing.

- [ ] **Step 2: Implement `src/mastra/index.ts`**

```ts
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { env } from '../config/env.js'
import { createLogger } from '../config/logger.js'
import { corsMiddleware } from '../config/cors.js'
import { requestIdInjector, requestLogger } from '../config/middleware.js'
import { healthRoute } from './routes/health.js'

export const mastra = new Mastra({
  logger: createLogger('mastra'),
  storage: new LibSQLStore({
    id: 'aether-storage',
    url: env.DATABASE_URL,
  }),
  server: {
    port: env.PORT,
    host: env.HOST,
    apiRoutes: [healthRoute],
    middleware: [
      corsMiddleware(),
      requestIdInjector,
      requestLogger,
    ],
  },
})
```

> If `Mastra` rejects an empty config (no `agents` key) at boot — verify in Step 5 — apply the fallback in Step 6. Default expectation: boots with zero agents.

- [ ] **Step 3: Implement `src/index.ts` entry**

```ts
export { mastra } from './mastra/index.js'
```

- [ ] **Step 4: Create a local `apps/agent-server/.env` (gitignored, not committed)**

```
NODE_ENV=development
PORT=4111
HOST=localhost
DATABASE_URL=file:./mastra.db
LOG_LEVEL=info
WEB_URL=http://localhost:3000
ALLOW_LOCAL_ENDPOINTS=false
```

- [ ] **Step 5: Boot the dev server and verify zero-agent startup**

Run: `npm run dev:agent` (in a separate terminal; keep it running)
Expected: server starts on `http://localhost:4111`, no fatal errors. OpenAPI available at `http://localhost:4111/api/openapi.json`.

Run from another terminal: `curl http://localhost:4111/health`
Expected: `{"status":"ok","service":"agent-server","version":"0.0.0","timestamp":"<iso8601>"}` with HTTP 200. A `file:./mastra.db` is created next to `apps/agent-server/`.

Run: `curl -i -H "Origin: http://localhost:3000" http://localhost:4111/health`
Expected: response includes `Access-Control-Allow-Origin: http://localhost:3000`.

Run: `curl -i -H "Origin: http://evil.example" http://localhost:4111/health`
Expected: 200 but **no** `Access-Control-Allow-Origin` header.

- [ ] **Step 6: Zero-agent fallback (only if Step 5 fails to boot)**

If Mastra errors with no registered agents, create `apps/agent-server/src/mastra/agents/dev-bootstrap-agent.ts`:

```ts
import { Agent } from '@mastra/core/agent'

// DEVELOPMENT ONLY — not a production Aether agent.
// Exists solely so `mastra dev` / `mastra build` accept a non-empty agents map.
// Remove once the first real agent lands in PR-2.
export const devBootstrapAgent = new Agent({
  id: 'dev-bootstrap-agent',
  name: 'Dev Bootstrap Agent',
  instructions:
    'DEVELOPMENT ONLY. This agent exists to satisfy Mastra boot validation in PR-0 and is not a production Aether agent. Do not call.',
  // No provider key is configured in PR-0; this agent is never invoked.
  model: 'openai/gpt-5.5',
})
```

Register it in `src/mastra/index.ts`:

```ts
import { devBootstrapAgent } from './agents/dev-bootstrap-agent.js'
// ...
export const mastra = new Mastra({
  agents: { devBootstrapAgent },
  // ... rest unchanged
})
```

Then add a one-line note to `README.md` "Implementation Status" calling out `dev-bootstrap-agent` as development-only. Re-run Step 5. Skip if Step 5 already succeeded.

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck --workspace @aether/agent-server`
Expected: 0 errors.

Run: `npm run build --workspace @aether/agent-server`
Expected: `.mastra/` directory produced in `apps/agent-server/`. Inspect its entry file; if it is not `index.mjs`, update the `start` script in `apps/agent-server/package.json` accordingly.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-server/src/mastra apps/agent-server/src/index.ts
git commit -m "feat(agent-server): wire Mastra instance, LibSQL storage, and /health route"
```

(Do **not** commit `apps/agent-server/.env` or `apps/agent-server/mastra.db` — both gitignored.)

---

## Task 5: `apps/web` foundation (config, env, api-client)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/eslint.config.mjs`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`
- Create: `apps/web/src/env.ts`, `apps/web/src/lib/config.ts`, `apps/web/src/lib/api-client.ts`

**Interfaces:**
- Consumes: `@aether/shared` (`HealthResponse`).
- Produces: `publicConfig` (frozen object with `agentServerUrl`); `fetchHealth(signal?)` returning `Promise<HealthResponse>`.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@aether/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@aether/shared": "*",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.0",
    "typescript": "^5.9.0"
  }
}
```

> Verify `lucide-react`'s latest published major before install. Run `npm view lucide-react version`. If it is `1.x`, change `^0.460.0` to `^1.0.0`. Pin to whatever `npm view` returns.

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "composite": true,
    "outDir": "./dist",
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "plugins": [{ "name": "next" }],
    "allowJs": true,
    "noEmit": true,
    "incremental": true
  },
  "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 3: Create `apps/web/eslint.config.mjs`**

```js
// @ts-check
import base from '../../eslint.config.mjs'

export default base
```

> Next 16 ships its own ESLint config. If `next lint` is the preferred entrypoint, add a `next.config`-aware flat config extension. Keep the base for now; refine in Task 9 if `npm run lint` flags Next-specific rules.

- [ ] **Step 4: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
}

export default config
```

- [ ] **Step 5: Create `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 6: Implement `src/env.ts`**

```ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_AGENT_SERVER_URL: z.string().url(),
})

export type WebEnv = z.infer<typeof schema>

function load(): WebEnv {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`[apps/web] Invalid environment:\n${issues}`)
  }
  return result.data
}

export const env = load()
```

- [ ] **Step 7: Implement `src/lib/config.ts`**

```ts
import { env } from '../env.js'

export interface PublicConfig {
  readonly agentServerUrl: string
}

export const publicConfig: PublicConfig = Object.freeze({
  agentServerUrl: env.NEXT_PUBLIC_AGENT_SERVER_URL,
})
```

- [ ] **Step 8: Implement `src/lib/api-client.ts`**

```ts
import type { HealthResponse } from '@aether/shared'
import { publicConfig } from './config.js'

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${publicConfig.agentServerUrl}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as HealthResponse
}
```

- [ ] **Step 9: Install workspace deps and verify imports resolve**

Run: `npm install`
Expected: `@aether/shared` linked into `apps/web/node_modules`.

Run: `npm run typecheck --workspace @aether/web`
Expected: 0 errors. (App Router pages/components don't exist yet — typecheck covers `src/env.ts`, `src/lib/*` only for now. They compile.)

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/eslint.config.mjs apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/src
git commit -m "feat(web): add typed env, public config, and health API client"
```

---

## Task 6: `apps/web` UI shell, page, health badge

**Files:**
- Create: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/shell.tsx`, `apps/web/src/components/health-badge.tsx`

**Interfaces:**
- Consumes: `@aether/shared` (`HealthStatus`), `src/lib/api-client.ts` (`fetchHealth`), `src/lib/config.ts` (`publicConfig`), Tailwind v4 tokens in `globals.css`.

- [ ] **Step 1: Implement `src/app/globals.css`**

```css
@import 'tailwindcss';

/* DESIGN.md tokens. Deviation: primary uses #0A0A0A (off-black) instead of the
   front-matter #000000 because the same doc's "Don'ts" forbid pure black. */
:root {
  --color-primary: #0a0a0a;
  --color-surface: #ffffff;
  --color-beige: #f5f1e8;
  --color-muted: #808080;
  --color-taupe: #b38b6d;
  --color-text: #1a1a1a;
  --color-text-inverted: #f5f1e8;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;

  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

html,
body {
  margin: 0;
  padding: 0;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Implement `src/components/shell.tsx`**

```tsx
import type { ReactNode } from 'react'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="sticky top-0 z-[100] border-b border-[var(--color-muted)]/30 bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-[var(--color-primary)]">Aether</span>
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
            foundation
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-16">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Implement `src/components/health-badge.tsx`**

```tsx
'use client'

import { Activity, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HealthStatus } from '@aether/shared'
import { fetchHealth } from '../lib/api-client.js'

type DisplayState = HealthStatus | 'unknown'

const POLL_INTERVAL_MS = 10_000

export function HealthBadge() {
  const [state, setState] = useState<DisplayState>('unknown')

  useEffect(() => {
    const controller = new AbortController()

    async function check() {
      try {
        const health = await fetchHealth(controller.signal)
        setState(health.status)
      } catch {
        setState('down')
      }
    }

    void check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      clearInterval(id)
      controller.abort()
    }
  }, [])

  return (
    <div className="flex items-center gap-3 border border-[var(--color-muted)]/40 bg-[var(--color-beige)] px-5 py-4 transition-opacity duration-200">
      <Icon state={state} />
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          agent-server
        </p>
        <p className="text-base font-medium text-[var(--color-text)]">{label(state)}</p>
      </div>
    </div>
  )
}

function label(state: DisplayState): string {
  switch (state) {
    case 'ok':
      return 'Reachable'
    case 'degraded':
      return 'Degraded'
    case 'down':
      return 'Unreachable'
    default:
      return 'Checking…'
  }
}

function Icon({ state }: { state: DisplayState }) {
  if (state === 'ok') {
    return <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" aria-hidden />
  }
  if (state === 'down' || state === 'degraded') {
    return <AlertTriangle className="h-5 w-5 text-[var(--color-taupe)]" aria-hidden />
  }
  return <Activity className="h-5 w-5 text-[var(--color-muted)]" aria-hidden />
}
```

- [ ] **Step 4: Implement `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '../components/shell.js'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aether',
  description: 'A multi-agent gateway. Foundation build.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Implement `src/app/page.tsx`**

```tsx
import { HealthBadge } from '../components/health-badge.js'

export default function HomePage() {
  return (
    <section className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
      <div className="space-y-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          foundation · PR-0
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-[var(--color-primary)] md:text-5xl">
          Aether is booting.
        </h1>
        <p className="max-w-[72ch] text-base leading-relaxed text-[var(--color-text)]">
          The agent gateway is being built on a clean foundation. No agents, providers, or tools are
          wired yet — they arrive in later pull requests. This page confirms the web and agent
          servers are running.
        </p>
        <a
          href="https://github.com/deserveto/aether"
          className="inline-block border border-[var(--color-primary)] bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px"
        >
          View repository
        </a>
      </div>
      <div className="flex justify-center md:justify-end">
        <div className="w-full max-w-sm">
          <HealthBadge />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Create `apps/web/.env.local` (gitignored, not committed)**

```
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:4111
```

- [ ] **Step 7: Start both apps and verify**

In terminal A: `npm run dev:agent`
In terminal B: `npm run dev:web`
Open `http://localhost:3000`.
Expected:
- Aether wordmark in sticky header.
- Split-screen hero with the "Aether is booting." headline.
- Health badge transitions from "Checking…" → "Reachable" within ~1s.
- DevTools network tab shows a 200 `GET /health` to `localhost:4111` with CORS headers.

- [ ] **Step 8: Typecheck and build the web app**

Run: `npm run typecheck --workspace @aether/web`
Expected: 0 errors.

Run: `npm run build --workspace @aether/web`
Expected: `.next/` produced; production build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): render Swiss-style shell with live agent-server health badge"
```

(Do not commit `apps/web/.env.local` — gitignored.)

---

## Task 7: SearXNG Docker Compose placeholder

**Files:**
- Create: `infra/searxng/docker-compose.yml`

- [ ] **Step 1: Create `infra/searxng/docker-compose.yml`**

```yaml
# PR-0 placeholder. web_search tool arrives in PR-4.
# This service is NOT started by `npm run dev`.
# Bring it up manually when working on PR-4:
#   docker compose -f infra/searxng/docker-compose.yml up -d
services:
  searxng:
    image: searxng/searxng:latest
    container_name: aether-searxng
    ports:
      - '8080:8080'
    volumes:
      - ./searxng:/etc/searxng:rw
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080/
      - UWSGI_WORKERS=4
```

- [ ] **Step 2: Validate the compose file syntax**

Run: `docker compose -f infra/searxng/docker-compose.yml config`
Expected: parses and prints the normalized config; exit 0. (Requires Docker installed; if unavailable locally, CI is not required to run this for PR-0 — document in README that Docker is optional.)

- [ ] **Step 3: Commit**

```bash
git add infra/searxng/docker-compose.yml
git commit -m "infra: add SearXNG docker-compose placeholder for PR-4"
```

---

## Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: install / lint / typecheck / test / build
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22.18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build
        env:
          # Next 16 build needs a public agent URL; point at the canonical dev port.
          NEXT_PUBLIC_AGENT_SERVER_URL: http://localhost:4111
          NODE_ENV: production
```

> The agent-server build (`mastra build`) does not require provider keys because no agent is registered. If the Task 4 fallback was used and `dev-bootstrap-agent` exists, `mastra build` still succeeds because the model string is only resolved at call time. Verify before merging.

- [ ] **Step 2: Lint the workflow file locally**

Run: `npx --yes -p yaml-lint yamllint .github/workflows/ci.yml`
Expected: exit 0. If `yamllint` flags style issues, the file is still structurally valid — fix only real errors, not style.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add install/lint/typecheck/test/build workflow"
```

---

## Task 9: Documentation — README rewrite + AGENTS.md update

**Files:**
- Modify: `README.md` (full rewrite of operational sections, preserve the existing product overview paragraph)
- Modify: `AGENTS.md` (replace "planned" toolchain wording with verified commands; keep constraints and dependency-rule sections intact)

- [ ] **Step 1: Rewrite `README.md`**

Replace the entire current contents with:

````markdown
# Aether

Aether is a multi-agent gateway and builder for running specialized AI agents through one user-facing application.

This repository is a **pre-implementation foundation**. PR-0 establishes the monorepo, tooling, and a minimal web shell + Mastra agent server. Product features (Agent Catalog, chat, providers, tools, QA agents) arrive in subsequent pull requests. See `docs/ROADMAP.md` for the full sequence.

## Prerequisites

| Tool | Version | Required |
|---|---|---|
| Node.js | >= 22.13 (22.18 LTS recommended) | yes |
| npm | >= 10 (bundled with Node) | yes |
| Docker | any recent version | optional (SearXNG in PR-4 only) |

## Quick start

```bash
git clone https://github.com/deserveto/aether.git
cd aether
cp .env.example .env
cp apps/agent-server/.env.example apps/agent-server/.env
cp apps/web/.env.example apps/web/.env.local 2>/dev/null || echo "NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:4111" > apps/web/.env.local
npm install
npm run dev
```

`npm run dev` starts both apps concurrently:

- **Web** — http://localhost:3000
- **Agent server (Mastra)** — http://localhost:4111

Verify the agent server:

```bash
curl http://localhost:4111/health
```

## Environment

All values are placeholders. **No provider API keys live in this repository.**

| Variable | Where | Description |
|---|---|---|
| `NODE_ENV` | both apps | `development` / `test` / `production` |
| `WEB_URL` | agent-server | Origin allowed by CORS |
| `NEXT_PUBLIC_AGENT_SERVER_URL` | web | Agent-server base URL used by the browser |
| `AGENT_SERVER_PORT` / `AGENT_SERVER_HOST` | agent-server | Mastra bind address |
| `DATABASE_URL` | agent-server | LibSQL file URL, e.g. `file:./mastra.db` |
| `LOG_LEVEL` | agent-server | pino level (`trace`…`fatal`) |
| `SEARXNG_URL` | root example only | Placeholder; consumed in PR-4 |
| `ALLOW_LOCAL_ENDPOINTS` | agent-server | Custom-endpoint dev bypass; consumed in PR-1 |

## Development commands

| Command | Effect |
|---|---|
| `npm run dev` | Start web + agent-server concurrently |
| `npm run dev:web` | Start web only |
| `npm run dev:agent` | Start agent server only |
| `npm run build` | Build web and agent-server |
| `npm run typecheck` | TypeScript project-reference build (no emit) |
| `npm run lint` | ESLint across the workspace |
| `npm run test` | Vitest across all `__tests__` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI-equivalent) |

## Repository structure

Current (PR-0):

```text
aether/
├── apps/
│   ├── web/              # Next.js 16 — minimal shell + health badge
│   └── agent-server/     # Mastra — zero agents, /health, LibSQL storage
├── packages/
│   └── shared/           # @aether/shared — errors, health, env, log types
├── infra/
│   └── searxng/          # docker-compose placeholder (PR-4)
├── docs/                 # product, architecture, contracts, roadmap, decisions, design
├── .github/workflows/    # CI
└── (root tooling)
```

Planned (later PRs): `packages/agents`, `packages/agent-builder`, `packages/providers`, `packages/tools`, `packages/database`. They are created when they have real content — not as empty placeholders. See `docs/ARCHITECTURE.md` for the target tree.

## Implementation status (PR-0)

- npm workspaces monorepo with TypeScript strict, ESLint, Prettier, Vitest.
- `apps/web`: Aether shell, health badge polling the agent server.
- `apps/agent-server`: Mastra server on port 4111, LibSQL file storage, `/health` route, strict CORS, pino logging. **Zero agents registered.**
- `packages/shared`: stable error shape, health response, env, and log-context types.
- CI runs lint, typecheck, test, build on every push and PR.
- SearXNG docker-compose placeholder for PR-4.

## Not implemented yet

The following are explicitly out of scope for PR-0 and arrive in later pull requests:

- Provider Registry and provider administration UI (PR-1)
- Agent Catalog and chat (PR-2)
- Agent Builder (PR-3)
- Web Search and Web Fetch tools (PR-4)
- QA Mobile with Maestro (PR-5)
- Supervisor Agent, PM Agent, Social Media Agent
- Telegram, Discord, Email Tool, Google Drive, OCR
- Streaming chat, tool execution, conversation persistence beyond storage initialization

## Architecture & contracts

Read `docs/` for the authoritative product, architecture, provider, agent, tool, roadmap, decision, and design references.
````

- [ ] **Step 2: Update `AGENTS.md`**

In `AGENTS.md`, find the "Repo state" section. Replace its first paragraph:

**Old:**
> This is a **pre-implementation foundation repo**. Only `README.md`, `AETHER_FOUNDATION.md`, and `docs/*.md` exist. There is **no `package.json`, no source code, no CI, no `.env.example`, no tooling config yet**.

**New:**
> This repository has the **PR-0 foundation** in place: npm workspaces (`apps/web`, `apps/agent-server`, `packages/shared`), TypeScript strict, ESLint flat config, Prettier, Vitest, GitHub Actions CI, and a SearXNG docker-compose placeholder. Provider/agent/tool packages arrive in later PRs.

In the same file, find the "Planned toolchain" section header. Rename it to **"Toolchain (verified in PR-0)"** and strike the "verify against actual config once PR-0 lands" caveat at the end of that section (it has landed).

Leave the hard-constraints, dependency-rules, and authoritative-specs sections unchanged.

- [ ] **Step 3: Format and verify**

Run: `npm run format`
Expected: README/AGENTS reformatted to Prettier (markdown handled).

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: rewrite README and update AGENTS.md for PR-0 foundation"
```

---

## Final verification (run before opening the PR)

- [ ] **V1: Clean install from scratch**

```bash
Remove-Item node_modules, package-lock.json -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item apps\*\node_modules, packages\*\node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm install
```
Expected: install completes; `package-lock.json` regenerated.

- [ ] **V2: Lint, typecheck, test, build**

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
Expected: all four exit 0. Build produces `apps/web/.next/` and `apps/agent-server/.mastra/`.

- [ ] **V3: Runtime smoke**

```bash
# terminal A
npm run dev:agent
# terminal B
curl -i http://localhost:4111/health
```
Expected: HTTP 200 JSON with `status: "ok"`.

```bash
# terminal C
npm run dev:web
```
Open `http://localhost:3000` → health badge shows "Reachable".

- [ ] **V4: Env-validation failure path**

```bash
# with DATABASE_URL unset
$env:DATABASE_URL=""
npm run dev:agent
```
Expected: server refuses to boot; error message names `DATABASE_URL` as the offending field.

- [ ] **V5: No secrets, no artifacts**

```bash
git status --porcelain
```
Expected: clean tree (or only intentionally untracked files). No `*.db`, `.env`, `.next/`, `.mastra/` staged.

Run a secret scan:
```bash
npx --yes -p gitleaks gitleaks detect --no-banner --redact
```
Expected: no findings.

- [ ] **V6: Docker compose valid (optional)**

```bash
docker compose -f infra/searxng/docker-compose.yml config
```
Expected: exit 0.

- [ ] **V7: Open the PR**

Push `chore/bootstrap-aether`, open a PR against `main`, assign **Mas Gitgit** as reviewer. PR description cites this plan and the design spec.

---

## Self-review notes

- **Spec coverage:** every section of the design spec maps to a task — root tooling (T1), shared (T2), agent-server config (T3), agent-server Mastra + health (T4), web foundation (T5), web UI (T6), SearXNG (T7), CI (T8), docs (T9). Verification section V1–V7 covers spec §8.
- **Placeholders:** none. Every code step shows full code. Where a version is uncertain (`lucide-react`, `mastra build` entry), the step gives an explicit `npm view` verification command and the conditional fix.
- **Type consistency:** `Env` type fields (T3 Step 7) match the consumption in `mastra/index.ts` (T4 Step 2) and `logger.ts`/`cors.ts`/`middleware.ts` (T3 Steps 8–10). `fetchHealth` (T5 Step 8) returns `HealthResponse` (T2 Step 7) consumed by `health-badge.tsx` (T6 Step 3). `ErrorCode` members in the test (T2 Step 4) match `errors.ts` (T2 Step 6).
