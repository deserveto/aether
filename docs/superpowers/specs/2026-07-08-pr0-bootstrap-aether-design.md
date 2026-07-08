# PR-0: Bootstrap Aether — Design Spec

- **Date:** 2026-07-08
- **Branch:** `chore/bootstrap-aether`
- **Reviewer:** Mas Gitgit
- **Status:** Approved (awaiting implementation plan)
- **Scope source:** `docs/ROADMAP.md` PR-0, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `AGENTS.md`, `docs/DESIGN.md`

## 1. Purpose

Establish a fresh, minimal, verified foundation for the Aether monorepo. No product features. No agents. No provider credentials. The deliverable is a clean-clone-able workspace where:

- `npm install` succeeds on a fresh clone.
- `npm run dev` starts both `apps/web` and `apps/agent-server`.
- The agent server boots Mastra with LibSQL storage and exposes `/health`.
- The web app renders a minimal Aether shell with a health indicator.
- CI runs install, lint, typecheck, test, build.
- No secret is committed. No future feature is faked.

This PR is intentionally narrow. Later PRs add providers, agents, tools, chat, and QA.

## 2. Non-Goals (Explicit Exclusions)

The following are **out of scope** and must not appear in PR-0:

- Provider Registry and provider administration UI
- Agent Builder
- Agent Catalog (no fake agents)
- Production chat / streaming
- QA Web Agent behavior
- Web Search and Web Fetch tools
- Maestro / QA Mobile
- Supervisor, PM, Social Media agents
- Telegram, Discord, Email, Google Drive, OCR
- `packages/agents`, `packages/agent-builder`, `packages/providers`, `packages/tools`, `packages/database` — these directories are created in their respective PRs, not as empty placeholders here.

Only `packages/shared` is created in PR-0 because it carries real foundational types used by both apps.

## 3. Technical Direction

| Layer | Decision | Rationale |
|---|---|---|
| Runtime | Node.js >= 22.13 (target 22.18+ for native TS execution) | Mastra requires modern Node; spec floor is 22.13 |
| Package manager | npm workspaces, single root lockfile | Mandated by spec; Mastra officially supports npm workspaces |
| Language | TypeScript strict, `target: ES2022`, `moduleResolution: bundler` | Mastra hard requirement; forbids CommonJS / `node` resolution |
| Agent runtime | `@mastra/core` 1.50.x, native Mastra server (`mastra dev` / `mastra build`) | Recommended path; Hono underneath; built-in OpenAPI/Swagger; less code than a custom adapter |
| Storage | `@mastra/libsql` 1.15.x, file-backed `file:./mastra.db` | LibSQL is compatible with current stable Mastra; no separate DB server for local dev |
| Web framework | Next.js 16 (App Router) | Latest stable; first-class Mastra integration available later |
| Styling | Tailwind v4 + CSS variables sourced from `docs/DESIGN.md` tokens | Swiss-style grid maps cleanly to utilities; not a component framework |
| Validation | Zod 4 (Mastra peer dependency) | Env schemas now; future request boundaries later |
| Lint | ESLint 10 flat config with typescript-eslint | Required by spec |
| Format | Prettier 3 | Recommended toolchain pick |
| Test | Vitest 4 with two real smoke tests | Gives `npm test` a real backend; minimal scope; no fake tests |
| Logging | `pino`, exposed to Mastra through its logger hook (Mastra `PinoLogger`-style adapter) | Structured logging foundation; Mastra-native |
| Process orchestration | `concurrently` for `npm run dev` | Runs web + agent together |
| Icons | `lucide-react` | `docs/DESIGN.md` mandates Lucide / Heroicons and forbids emojis in UI |
| Local infrastructure | Docker Compose with a SearXNG service placeholder only | Spec: SearXNG placeholder, no `web_search` yet |

### 3.1 Mastra Agents in PR-0

**Zero agents are registered.** The `Mastra` constructor accepts an empty configuration and the server boots without any registered agent. This honors the spec's rule: *"A minimal internal development agent may only be created if Mastra requires one for validation."* Mastra does not require one, so none is created.

Fallback (only if verification proves `mastra dev` / `mastra build` fail with zero agents): register one agent named `dev-bootstrap-agent` whose instructions state explicitly that it is development-only and **not** a production Aether agent. README and code comments must call this out. The default plan is no fallback.

## 4. Repository Structure (PR-0)

```text
aether/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/
│   │   │   │   ├── shell.tsx
│   │   │   │   └── health-badge.tsx
│   │   │   ├── lib/
│   │   │   │   ├── config.ts
│   │   │   │   └── api-client.ts
│   │   │   └── env.ts
│   │   ├── next.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── tsconfig.json
│   │   ├── eslint.config.mjs
│   │   └── package.json
│   └── agent-server/
│       ├── src/
│       │   ├── mastra/
│       │   │   ├── index.ts
│       │   │   └── routes/
│       │   │       └── health.ts
│       │   ├── config/
│       │   │   ├── env.ts
│       │   │   ├── logger.ts
│       │   │   └── cors.ts
│       │   └── index.ts
│       ├── .env.example
│       ├── tsconfig.json
│       ├── eslint.config.mjs
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── index.ts
│       │   ├── errors.ts
│       │   ├── health.ts
│       │   ├── env-types.ts
│       │   ├── log-context.ts
│       │   └── __tests__/
│       │       └── errors.test.ts
│       ├── tsconfig.json
│       ├── eslint.config.mjs
│       └── package.json
├── infra/
│   └── searxng/
│       └── docker-compose.yml
├── docs/
│   └── (existing, unchanged)
├── .editorconfig
├── .env.example
├── .gitignore
├── .prettierrc.json
├── .prettierignore
├── eslint.config.mjs
├── tsconfig.base.json
├── vitest.config.ts
├── package.json
├── package-lock.json
├── AGENTS.md
└── README.md
```

## 5. File-by-File Specification

### 5.1 Root configuration

#### `package.json`

- `name`: `aether`
- `private`: true
- `type`: `module`
- `workspaces`: `["apps/*", "packages/*"]`
- `engines`: `{ "node": ">=22.13" }`
- `scripts`:
  - `dev`: `concurrently -n web,agent -c magenta,green "npm:dev:web" "npm:dev:agent"`
  - `dev:web`: `npm run dev --workspace @aether/web`
  - `dev:agent`: `npm run dev --workspace @aether/agent-server`
  - `build`: `npm run build --workspace @aether/web && npm run build --workspace @aether/agent-server`
  - `typecheck`: `tsc -b`
  - `lint`: `eslint .`
  - `format`: `prettier --write .`
  - `format:check`: `prettier --check .`
  - `test`: `vitest run`
- `devDependencies`: `typescript`, `eslint`, `prettier`, `eslint-config-prettier`, `eslint-plugin-prettier` (optional), `concurrently`, `vitest`, `tsx`, root `@types/node`.

#### `tsconfig.base.json`

Strict shared options consumed by every package via `extends`.

- `compilerOptions`:
  - `target`: `ES2022`
  - `module`: `ES2022`
  - `moduleResolution`: `bundler`
  - `lib`: `["ES2022"]`
  - `strict`: true
  - `noUncheckedIndexedAccess`: true
  - `exactOptionalPropertyTypes`: true
  - `noImplicitOverride`: true
  - `noFallthroughCasesInSwitch`: true
  - `esModuleInterop`: true
  - `forceConsistentCasingInFileNames`: true
  - `skipLibCheck`: true
  - `resolveJsonModule`: true
  - `isolatedModules`: true
  - `verbatimModuleSyntax`: true
  - `noEmit`: true
- `paths`: `@aether/shared` -> `./packages/shared/src/index.ts`

#### `eslint.config.mjs`

Flat config. Extends `typescript-eslint` recommended. Adds `eslint-config-prettier` last to disable formatting rules. Ignores `.next`, `.mastra`, `dist`, `node_modules`, `coverage`. No global rule suppressions.

#### `.prettierrc.json`

Matches Mastra's prevailing style for minimal diff friction:

- `semi`: false
- `singleQuote`: true
- `trailingComma`: `all`
- `printWidth`: 100
- `tabWidth`: 2

#### `.prettierignore`

`.next`, `.mastra`, `dist`, `node_modules`, `package-lock.json`, `*.db`, `docs/AETHER_FOUNDATION.md`.

#### `.gitignore`

`node_modules`, `.next`, `.mastra`, `dist`, `*.db`, `*.db-journal`, `.env`, `.env.local`, `.env.*.local`, `coverage`, `.vitest-cache`, OS files.

#### `.editorconfig`

UTF-8, LF, 2-space indent, final newline, trim trailing whitespace.

#### `.env.example` (root)

Documents the full shape across both apps. Placeholder values only, no real keys.

```
# Application
NODE_ENV=development

# Web app
WEB_URL=http://localhost:3000
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:4111

# Agent server
AGENT_SERVER_URL=http://localhost:4111
AGENT_SERVER_PORT=4111
AGENT_SERVER_HOST=localhost

# Storage (local LibSQL file)
DATABASE_URL=file:./apps/agent-server/mastra.db

# Logging
LOG_LEVEL=info

# Infrastructure placeholder (used in PR-4)
SEARXNG_URL=http://localhost:8080

# Custom-endpoint dev bypass (used in PR-1)
ALLOW_LOCAL_ENDPOINTS=false
```

No provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) — those belong to PR-1.

### 5.2 `packages/shared/`

Workspace package `@aether/shared`. Private. `type: module`. `exports` maps `.` -> `./src/index.ts`.

#### `src/errors.ts`

Stable error shape aligned with `docs/TOOL_CONTRACT.md` section 5.

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

export class AppError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly details?: AppErrorDetails

  constructor(input: {
    code: ErrorCode
    message: string
    retryable?: boolean
    details?: AppErrorDetails
    cause?: unknown
  }) {
    super(input.message, { cause: input.cause })
    this.name = 'AppError'
    this.code = input.code
    this.retryable = input.retryable ?? false
    if (input.details) this.details = input.details
  }
}
```

#### `src/health.ts`

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

#### `src/env-types.ts`

```ts
export type AppEnv = 'development' | 'test' | 'production'
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
```

#### `src/log-context.ts`

```ts
export interface BaseLogContext {
  readonly requestId?: string
  readonly agentId?: string
  readonly conversationId?: string
  readonly userId?: string
}
```

#### `src/index.ts`

Barrel re-exports of the four modules above.

#### `src/__tests__/errors.test.ts`

Asserts:
- `AppError` carries `code`, `message`, `retryable`, optional `details`.
- Default `retryable` is `false`.
- `ErrorCode` includes the stable codes from the contract.

### 5.3 `apps/agent-server/`

Workspace package `@aether/agent-server`. Private. `type: module`.

#### `package.json`

- `scripts`:
  - `dev`: `mastra dev`
  - `build`: `mastra build`
  - `start`: `node .mastra/<generated-entry>.mjs` (exact filename confirmed during implementation; `mastra build` emits the Hono server into `.mastra/`)
  - `typecheck`: `tsc --noEmit`
  - `lint`: `eslint .`
  - `test`: `vitest run`
- `dependencies`: `@mastra/core`, `@mastra/libsql`, `zod`, `pino`, `@aether/shared`.
- `devDependencies`: `mastra`, `typescript`, `@types/node`, `vitest`.

#### `.env.example` (app-local)

Mirror of the agent-server subset of the root example. `PORT=4111`, `DATABASE_URL=file:./mastra.db`, `LOG_LEVEL=info`, `WEB_URL=http://localhost:3000`, `ALLOW_LOCAL_ENDPOINTS=false`.

#### `src/config/env.ts`

Zod schema. Required: `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `WEB_URL`. Validates `NODE_ENV` is one of the `AppEnv` values and `LOG_LEVEL` is one of `LogLevel`. Exits with a clear `AppError` (code `NOT_CONFIGURED`) listing every missing or invalid field if validation fails. Exports typed `env`.

#### `src/config/logger.ts`

Creates a `pino` instance bound to `LOG_LEVEL`. Configures redaction paths for known secret substrings (`*.key`, `*.secret`, `*.token`, `authorization`). Exports the logger factory.

#### `src/config/cors.ts`

Builds an allowlist from `WEB_URL`. Rejects wildcard origins in `production`. Exposes a Hono-style middleware that sets `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and short-circuits `OPTIONS` with 204.

#### `src/mastra/routes/health.ts`

Uses `registerApiRoute` from `@mastra/core/server`:

```ts
registerApiRoute('/health', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'Service health',
    tags: ['system'],
    responses: {
      200: { description: 'Service is healthy' },
      503: { description: 'Service degraded' },
    },
  },
  handler: async (c) => {
    // ping storage; assemble HealthResponse; 503 if storage unreachable
  },
})
```

#### `src/mastra/index.ts`

```ts
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { env } from '../config/env'
import { createLogger } from '../config/logger'
import { corsMiddleware, requestLogger, requestIdInjector } from '../config/...'
import { healthRoute } from './routes/health'

export const mastra = new Mastra({
  logger: createLogger(),
  storage: new LibSQLStore({ id: 'aether-storage', url: env.DATABASE_URL }),
  server: {
    port: env.PORT,
    host: env.HOST,
    apiRoutes: [healthRoute],
    middleware: [corsMiddleware, requestIdInjector, requestLogger],
  },
})
```

No `agents` key. No provider keys referenced. If `mastra dev` refuses to boot with zero agents (R1), the fallback in section 3.1 applies.

#### `src/index.ts`

Re-exports `./mastra/index`. This is the entry that `mastra build` consumes.

#### `src/__tests__/env.test.ts`

Asserts the Zod schema:
- Accepts a complete valid env object.
- Rejects when `NODE_ENV` is not in `AppEnv`.
- Rejects when `DATABASE_URL` is empty.
- Rejects when `LOG_LEVEL` is not in `LogLevel`.
- Error output names every offending field.

### 5.4 `apps/web/`

Workspace package `@aether/web`. Private. Next.js 16 App Router.

#### `package.json`

- `scripts` per Next 16 (`dev`, `build`, `start`, `lint`).
- `dependencies`: `next`, `react`, `react-dom`, `lucide-react`, `@aether/shared`.
- `devDependencies`: `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`.

#### `next.config.ts`

Minimal. `reactStrictMode: true`. No experimental flags unless required by Next 16 defaults.

#### `postcss.config.mjs`

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

#### `src/env.ts`

Server-side Zod validation of `NODE_ENV` and `NEXT_PUBLIC_AGENT_SERVER_URL` (must be a valid URL). Throws on invalid.

#### `src/lib/config.ts`

Builds a frozen `publicConfig` object from `NEXT_PUBLIC_*` for client consumption.

#### `src/lib/api-client.ts`

Typed fetch helpers using `@aether/shared` types. No Mastra imports (honors ARCHITECTURE section 4 dependency rules: web -> shared types + typed client only).

- `fetchHealth(signal?): Promise<HealthResponse>` -> `${publicConfig.agentServerUrl}/health`

#### `src/app/globals.css`

```css
@import 'tailwindcss'

:root {
  --color-primary: #0a0a0a   /* off-black; DESIGN.md forbids pure #000000 */
  --color-surface: #ffffff
  --color-beige: #f5f1e8
  --color-muted: #808080
  --color-taupe: #b38b6d
  --radius-sm: 2px
  --radius-md: 4px
  --radius-lg: 8px
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif
  --font-mono: 'JetBrains Mono', ui-monospace, monospace
}
```

A code comment documents the deliberate deviation from `DESIGN.md`'s front-matter `#000000` in favor of the same doc's "no pure black" rule.

#### `src/app/layout.tsx`

Root HTML, `lang="en"`, title `Aether`, metadata, `<Shell>` wrapper. Loads system sans font stack.

#### `src/app/page.tsx`

Split-screen hero on a Swiss grid:
- Left: Aether wordmark, one-line description, primary button (placeholder link, non-functional — labeled clearly).
- Right: `<HealthBadge>` showing agent-server connectivity.
- Max-width 1280px, 1.5rem side padding, sharp edges, off-black surface.
- No fake catalog. No fake agents. No lorem ipsum.

#### `src/components/shell.tsx`

Top nav with Aether mark + minimal main container. Sticky header, `min-h-[100dvh]` (DESIGN.md forbids `h-screen`).

#### `src/components/health-badge.tsx`

Client component. Polls `/api/health` (proxied through Next to agent-server to avoid CORS during dev if needed; otherwise direct fetch using `publicConfig.agentServerUrl`). Shows three states via Lucide icon + label: `ok`, `degraded`, `down`. 200ms transition on state change.

### 5.5 `.github/workflows/ci.yml`

Triggers: `push` to `main`, `pull_request` to `main`.

Single job `quality`, runs-on `ubuntu-latest`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: '22.18'`, `cache: 'npm'`
3. `npm ci`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run test`
7. `npm run build`

No `continue-on-error` anywhere. Each step gated by the previous.

### 5.6 `infra/searxng/docker-compose.yml`

```yaml
# PR-0 placeholder. web_search tool arrives in PR-4.
# This service is not started by `npm run dev`.
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

A `./searxng/settings.yml` placeholder is intentionally omitted; SearXNG ships a working default. Documented in README that this is infrastructure-only.

### 5.7 `README.md` rewrite

Sections:
1. **Aether** — one-paragraph description (reuses existing copy).
2. **Prerequisites** — Node >= 22.13, npm >= 10, Docker optional (for SearXNG later).
3. **Quick Start** — clone, `cp .env.example .env`, `npm install`, `npm run dev`.
4. **Environment Setup** — table of variables with description, required, default.
5. **Development Commands** — table: `dev`, `dev:web`, `dev:agent`, `build`, `typecheck`, `lint`, `test`, `format`.
6. **Repository Structure** — current tree (PR-0) plus planned tree pointer to `docs/ARCHITECTURE.md`.
7. **Implementation Status** — exactly what PR-0 ships (workspace, web shell, Mastra server, LibSQL, CI, SearXNG placeholder).
8. **Not Implemented** — explicit bullet list matching section 2 of this spec.
9. **Architecture & Contracts** — pointer to `docs/`.

### 5.8 `AGENTS.md` update

After verification, replace "planned" phrasing with real commands. Keep the hard-constraints and dependency-rules sections intact.

## 6. Dependency Rules Enforced

- `apps/web` imports only from `@aether/shared` and its own internals. Never imports Mastra, never imports provider code, never imports agent-server internals.
- `apps/agent-server` imports from `@mastra/*`, `@aether/shared`, and its own internals.
- `packages/shared` imports nothing from apps or other packages.
- No circular package dependencies.

## 7. Risks and Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R1 | `mastra dev` / `mastra build` may fail with zero registered agents | Verify during implementation. Fallback: one `dev-bootstrap-agent` clearly marked development-only. Default plan: no fallback. |
| R2 | Mastra peer dependency drift across `@mastra/core`, `@mastra/libsql`, `mastra` CLI | Pin minor versions; run `npm ls @mastra/core` locally and in CI. |
| R3 | Type overlap between Next 16 and Mastra client in the monorepo | Keep web isolated via typed fetch client; no shared Mastra types in web. |
| R4 | LibSQL native binding failure on Windows dev host | LibSQL ships a pure-JS fallback; verify on this Windows machine during implementation. |
| R5 | `mastra dev` loads `.env` from app dir, not monorepo root | Place real `.env` at `apps/agent-server/.env`. Root `.env.example` documents the combined shape; developers copy subsets into the app dir as needed. |
| R6 | Tailwind v4 PostCSS pipeline differences with Next 16 | Use `@tailwindcss/postcss` v4 plugin; no `tailwind.config.js` needed. |
| R7 | Empty package directories violate "no fake placeholders" | Only `packages/shared` is created in PR-0; all other package dirs arrive in their owning PRs. |
| R8 | `DESIGN.md` front-matter primary `#000000` conflicts with its "no pure black" rule | Use off-black `#0A0A0A` for `--color-primary`; document the deviation in `globals.css`. |

## 8. Verification Plan

| Check | Method |
|---|---|
| Clean install | `Remove-Item node_modules,package-lock.json -Recurse -Force; npm install` |
| Typecheck | `npm run typecheck` exits 0 |
| Lint | `npm run lint` exits 0 |
| Tests | `npm run test` passes |
| Build | `npm run build` produces `apps/web/.next` and `apps/agent-server/.mastra` |
| Web starts | `npm run dev:web`, `http://localhost:3000` renders shell + health badge |
| Agent starts | `npm run dev:agent`, `http://localhost:4111` boots with zero agents |
| Health responds | `curl http://localhost:4111/health` returns `{ status: "ok", service, version, timestamp }` |
| Env validation | Unset `DATABASE_URL` -> agent-server exits with an `AppError` naming the missing field |
| CORS strict | Request with disallowed `Origin` rejected; allowed origin returns CORS headers |
| Docker valid | `docker compose -f infra/searxng/docker-compose.yml config` parses |
| No secrets | `git diff --cached` review; `.env` gitignored; grep tree for common key patterns |
| No artifacts | `.mastra`, `.next`, `*.db` absent from `git status` |

## 9. Conflicts Between Foundation Docs and Current Package Behavior

| Conflict | Resolution |
|---|---|
| `DESIGN.md` primary `#000000` vs its "no pure black" rule | Use `#0A0A0A`; token name `--color-primary` retained. |
| `ARCHITECTURE.md` section 3 lists `packages/agents/qa-web`, `packages/tools/browser`, etc. | Those are target structure for later PRs. PR-0 creates only `packages/shared`. README and AGENTS.md state this. |
| `PROVIDER_CONTRACT.md` lists `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. | Belong to PR-1. PR-0 `.env.example` omits all provider keys. |
| `AGENTS.md` calls LibSQL and SearXNG "planned" | PR-0 makes LibSQL real and SearXNG a compose placeholder. AGENTS.md updated post-verification. |
| Mastra's new model format `provider/model` vs any contract implying provider objects | No agents in PR-0, so no immediate conflict. Noted for PR-2 implementer. |
| Mastra default port 4111 vs unspecified agent port | 4111 adopted as canonical; documented in README and `.env.example`. |

## 10. Acceptance Criteria (from ROADMAP PR-0)

- Fresh clone installs successfully.
- Web and agent server run locally.
- CI passes.
- No provider secret is committed.
- Structure follows architecture documentation (current subset, documented).
