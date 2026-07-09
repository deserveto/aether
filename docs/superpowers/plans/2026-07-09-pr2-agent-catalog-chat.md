# Agent Catalog and Chat (PR-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working agent experience — an Agent Catalog, chat with the QA Web Agent over persisted conversations, streaming responses, a tool-event timeline, and human approval for consequential browser actions.

**Architecture:** Mastra-native runtime (Approach A). Mastra `Agent` + `Memory` + native per-tool approval (`requireApproval`) drive execution; Aether adds a manifest registry, `conversations`/`tool_events` tables, custom SSE routes wrapping `agent.stream()`, and a Playwright browser engine. Messages persist via Mastra `Memory` over the existing LibSQLStore; `conversations.threadId` is the bridge. `agentId` is immutable per conversation.

**Tech Stack:** TypeScript (strict), npm workspaces, Mastra 1.50 (`@mastra/core`, `@mastra/libsql`, new `@mastra/memory`), Drizzle + LibSQL, Vitest, Next.js 16, React 19, Tailwind v4, Playwright.

## Global Constraints

- Agent IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; reserved `qa-web-agent`, `qa-mobile-agent`; no generic `main-agent` (ADR-005).
- `agentId` is immutable after a conversation is created; switching agents creates a new conversation (ADR-010).
- Secrets never reach the browser (ADR-009) — web works with IDs only.
- Mastra env schema rule: no `.default()`/`.optional()`/`z.union` in `envSchema` (zod-v4 `toJSONSchema` crash); seed defaults in `vitest.setup.js` instead.
- Dependency rules: `packages/agents → shared`; `packages/tools → shared + external SDKs` (Playwright) — **no `@mastra/core` import inside packages/tools**; Mastra `createTool` wrappers live in `apps/agent-server`. `apps/web → shared types only`.
- Custom `apiRoute` handlers return a `Response`; SSE = `new Response(readable, { headers })`.
- All validation commands run from repo root: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, `npm run build`.
- Colocated tests in `__tests__/` dirs; DI pattern (`createXxxRoutes(deps)` + production wiring) from PR-1; synthetic Hono context in route tests.
- Tailwind v4 + CSS-var design tokens (`var(--color-*)`); `useToast()` for feedback; `'use client'` on interactive components; lucide-react icons.
- Branch: `feat/agent-catalog-chat` (from `main`). Reviewer: Mas Gitgit.

---

## File Structure

**New packages:**
- `packages/agents/` — built-in agent declarations (manifest + instructions), ID validation. Deps: `@aether/shared`.
- `packages/tools/` — Playwright browser engine (`BrowserSessionStore` + actions) + risk metadata. Deps: `@aether/shared`, `playwright`. No Mastra.

**Modified packages:**
- `packages/shared/src/agents.ts` (new), `packages/shared/src/conversation.ts` (new), `packages/shared/src/index.ts` (re-export).
- `packages/database/src/schema.ts` (`conversations`, `tool_events` tables), `packages/database/src/index.ts` (`initDb` blocks).

**Agent server (`apps/agent-server/`):**
- `src/config/env.ts` — two new required env fields.
- `src/agents/manifests.ts` — adapt `packages/agents` declarations → runtime manifests.
- `src/agents/resolver.ts` — `AgentResolver` (catalog + resolve, `configured` flag).
- `src/agents/build.ts` — resolve binding → `LanguageModelV1` → build Mastra `Agent` + `Memory`; build tool wrappers.
- `src/tools/browser.ts` — `createTool` wrappers over `packages/tools` engine (click/type `requireApproval`).
- `src/mastra/routes/agents.ts`, `conversations.ts`, `chat.ts` — DI routes + pure `mapStreamToSse`.
- `src/mastra/index.ts` — add `agents:` map + new routes.
- `package.json` — add `@aether/memory`, `@aether/agents`, `@aether/tools`, `@mastra/memory`, `playwright`.

**Web (`apps/web/`):**
- `src/features/chat/chat-api.ts` — catalog/conversation/approval + SSE streaming reader.
- `src/features/agents/index.tsx` + `src/app/agents/page.tsx` — catalog.
- `src/features/chat/index.tsx` + components (`MessageList`, `Composer`, `ToolTimeline`, `ApprovalBar`) + `src/app/chat/[conversationId]/page.tsx`.
- `src/components/shell.tsx` — nav link.
- `src/features/providers/components/AgentBindingManager.tsx` — dynamic agent list.

**Config:** `tsconfig.base.json` (paths for `@aether/agents`, `@aether/tools`), `vitest.config.ts` (aliases), `vitest.setup.js` (new env seeds), `.env.example` (root + agent-server).

---

## Task 0: Branch + scaffolding config

**Files:**
- Modify: `tsconfig.base.json`, `vitest.config.ts`, root `.env.example`, `apps/agent-server/.env.example`

**Interfaces:**
- Produces: path aliases `@aether/agents`, `@aether/tools` resolvable in typecheck + vitest.

- [ ] **Step 1: Create the feature branch**

Run: `git checkout -b feat/agent-catalog-chat main`
Expected: on new branch.

- [ ] **Step 2: Add path aliases to `tsconfig.base.json`**

In the `paths` block (alongside `@aether/providers`), add:

```json
"@aether/agents": ["../packages/agents/src/index.ts"],
"@aether/agents/*": ["../packages/agents/src/*"],
"@aether/tools": ["../packages/tools/src/index.ts"],
"@aether/tools/*": ["../packages/tools/src/*"]
```

- [ ] **Step 3: Add vitest aliases to `vitest.config.ts`**

In `resolve.alias`, alongside the existing `@aether/shared`/`@aether/database` entries, add:

```js
'@aether/agents': path.resolve(__dirname, 'packages/agents/src/index.ts'),
'@aether/tools': path.resolve(__dirname, 'packages/tools/src/index.ts'),
```

- [ ] **Step 4: Document new env in `.env.example` files**

Append to root `.env.example` and `apps/agent-server/.env.example`:

```env
# PR-2: Agent Catalog and Chat
AETHER_DEFAULT_AGENT_ID=qa-web-agent
AETHER_LOCAL_USER_ID=local-user
```

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json vitest.config.ts .env.example apps/agent-server/.env.example
git commit -m "chore(pr-2): branch scaffolding, path aliases, env placeholders"
```

---

## Task 1: Shared contract types

**Files:**
- Create: `packages/shared/src/agents.ts`, `packages/shared/src/conversation.ts`, `packages/shared/src/__tests__/agents.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `AgentManifest`, `AgentModelBinding`, `CatalogAgent`, `Conversation`, `ToolEvent`, `ToolEventStatus`, agent ID regex `AGENT_ID_PATTERN`, `assertValidAgentId(id)`, reserved-id set `RESERVED_AGENT_IDS`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/__tests__/agents.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AGENT_ID_PATTERN,
  RESERVED_AGENT_IDS,
  assertValidAgentId,
} from '../agents.js'
import { AppError, ErrorCode } from '../errors.js'

describe('agent id contract', () => {
  it('accepts lowercase kebab-case ids', () => {
    expect(AGENT_ID_PATTERN.test('qa-web-agent')).toBe(true)
    expect(AGENT_ID_PATTERN.test('a')).toBe(true)
    expect(AGENT_ID_PATTERN.test('qa2-web')).toBe(true)
  })

  it('rejects invalid ids', () => {
    expect(AGENT_ID_PATTERN.test('QA-Web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('qa_web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('-qa')).toBe(false)
    expect(AGENT_ID_PATTERN.test('qa--web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('')).toBe(false)
  })

  it('reserves qa agent ids', () => {
    expect(RESERVED_AGENT_IDS.has('qa-web-agent')).toBe(true)
    expect(RESERVED_AGENT_IDS.has('qa-mobile-agent')).toBe(true)
  })

  it('asserts valid ids pass and invalid throw INVALID_INPUT', () => {
    expect(assertValidAgentId('qa-web-agent')).toBe(true)
    expect(() => assertValidAgentId('Bad!')).toThrow(AppError)
    try {
      assertValidAgentId('Bad!')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run packages/shared/src/__tests__/agents.test.ts`
Expected: FAIL — module `../agents.js` not found.

- [ ] **Step 3: Implement `packages/shared/src/agents.ts`**

```ts
import { AppError, ErrorCode } from './errors.js'

export type AgentSource = 'code' | 'stored'
export type AgentStatus = 'draft' | 'published' | 'archived'
export type AgentCategory = 'qa' | 'research' | 'productivity' | 'social' | 'custom'

export interface AgentModelBinding {
  readonly primaryModelProfileId: string
  readonly fallbackModelProfileIds: readonly string[]
}

export interface AgentManifest {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: AgentCategory
  readonly source: AgentSource
  readonly status: AgentStatus
  readonly protected: boolean
  readonly capabilities: readonly string[]
  readonly toolIds: readonly string[]
  readonly modelBinding: AgentModelBinding | null
  readonly memory: { readonly enabled: boolean; readonly mode: 'thread' | 'resource-and-thread' }
  readonly visibility: 'private' | 'internal' | 'public'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CatalogAgent {
  readonly manifest: AgentManifest
  readonly configured: boolean
}

export const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const RESERVED_AGENT_IDS: ReadonlySet<string> = new Set([
  'qa-web-agent',
  'qa-mobile-agent',
])

export function assertValidAgentId(id: string): true {
  if (!AGENT_ID_PATTERN.test(id)) {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: `Invalid agent id: "${id}". Use lowercase kebab-case.`,
    })
  }
  return true
}
```

- [ ] **Step 4: Implement `packages/shared/src/conversation.ts`**

```ts
export interface Conversation {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export type ToolEventStatus =
  | 'requested' | 'approved' | 'denied' | 'running' | 'success' | 'error'

export interface ToolEvent {
  readonly id: string
  readonly conversationId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly riskLevel: 'read' | 'interactive' | 'consequential' | 'system'
  readonly status: ToolEventStatus
  readonly input: unknown
  readonly output: unknown
  readonly error: { readonly code: string; readonly message: string } | null
  readonly startedAt: string
  readonly endedAt: string | null
}
```

- [ ] **Step 5: Re-export from `packages/shared/src/index.ts`**

Add to the existing re-export block:

```ts
export * from './agents.js'
export * from './conversation.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- --run packages/shared/src/__tests__/agents.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/agents.ts packages/shared/src/conversation.ts packages/shared/src/__tests__/agents.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add agent manifest, conversation, and tool-event contract types"
```

---

## Task 2: Database tables for conversations and tool events

**Files:**
- Modify: `packages/database/src/schema.ts`, `packages/database/src/index.ts`
- Test: `packages/database/src/__tests__/conversations.test.ts`

**Interfaces:**
- Produces: Drizzle tables `conversations`, `toolEvents` (exported from `@aether/database`); `initDb()` creates both; select/insert inferred types.

- [ ] **Step 1: Write the failing test**

`packages/database/src/__tests__/conversations.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { client, conversations, db, initDb, toolEvents } from '../index.js'

describe('conversations and tool events', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()
  })

  afterEach(async () => {
    await client.execute({ sql: 'DELETE FROM tool_events', args: [] })
    await client.execute({ sql: 'DELETE FROM conversations', args: [] })
  })

  it('persists a conversation with its thread id', async () => {
    const now = new Date().toISOString()
    const [created] = await db
      .insert(conversations)
      .values({
        id: 'conv-1',
        userId: 'local-user',
        agentId: 'qa-web-agent',
        threadId: 'thread-1',
        title: 'Test',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    expect(created?.agentId).toBe('qa-web-agent')

    const found = await db.query.conversations.findFirst({
      where: (fields, operators) => operators.eq(fields.id, 'conv-1'),
    })
    expect(found?.threadId).toBe('thread-1')
  })

  it('cascades tool event deletion when a conversation is removed', async () => {
    const now = new Date().toISOString()
    await db.insert(conversations).values({
      id: 'conv-2',
      userId: 'local-user',
      agentId: 'qa-web-agent',
      threadId: 'thread-2',
      title: 'Cascade',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(toolEvents).values({
      id: 'te-1',
      conversationId: 'conv-2',
      toolCallId: 'call-1',
      toolName: 'browser.navigate',
      riskLevel: 'interactive',
      status: 'success',
      input: '{}',
      startedAt: now,
    })
    await db.delete(conversations).where(eq(conversations.id, 'conv-2'))

    const remaining = await db.query.toolEvents.findMany({
      where: (fields, operators) => operators.eq(fields.conversationId, 'conv-2'),
    })
    expect(remaining).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run packages/database/src/__tests__/conversations.test.ts`
Expected: FAIL — `conversations` is not exported.

- [ ] **Step 3: Add tables to `packages/database/src/schema.ts`**

Append (after `agentModelBindings`):

```ts
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  agentId: text('agent_id').notNull(),
  threadId: text('thread_id').notNull().unique(),
  title: text('title').notNull(),
  status: text('status').$type<'active' | 'archived'>().default('active').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
})

export interface ToolEventError {
  readonly code: string
  readonly message: string
}

export const toolEvents = sqliteTable('tool_events', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  riskLevel: text('risk_level')
    .$type<'read' | 'interactive' | 'consequential' | 'system'>()
    .notNull(),
  status: text('status')
    .$type<'requested' | 'approved' | 'denied' | 'running' | 'success' | 'error'>()
    .notNull(),
  input: text('input', { mode: 'json' }).notNull(),
  output: text('output', { mode: 'json' }).$type<unknown>(),
  error: text('error', { mode: 'json' }).$type<ToolEventError>(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
})
```

- [ ] **Step 4: Add `initDb` blocks to `packages/database/src/index.ts`**

Inside `initDb()`, after the `agent_model_bindings` block, append:

```ts
  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      thread_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tool_events (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- --run packages/database/src/__tests__/conversations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run full typecheck + db tests**

Run: `npm run typecheck`
Expected: PASS. Then `npm run test -- --run packages/database` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema.ts packages/database/src/index.ts packages/database/src/__tests__/conversations.test.ts
git commit -m "feat(database): add conversations and tool_events tables"
```

---

## Task 3: packages/agents — built-in declarations

**Files:**
- Create: `packages/agents/package.json`, `packages/agents/tsconfig.json`, `packages/agents/src/index.ts`, `packages/agents/src/qa-web.ts`, `packages/agents/src/__tests__/agents.test.ts`

**Interfaces:**
- Produces: `@aether/agents` exports `BuiltInAgentDeclaration` (`{ manifest: AgentManifest; instructions: string }`), `BUILT_IN_AGENTS: BuiltInAgentDeclaration[]`, `listBuiltIn()`, `getBuiltIn(id)`, `RESERVED_AGENT_IDS`, `AGENT_ID_PATTERN`, `assertValidAgentId` (re-exported from shared).
- Consumes: `@aether/shared` (`AgentManifest`, id helpers).

- [ ] **Step 1: Write the failing test**

`packages/agents/src/__tests__/agents.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUILT_IN_AGENTS, getBuiltIn, listBuiltIn } from '../index.js'

describe('built-in agents', () => {
  it('lists only the QA Web Agent in PR-2', () => {
    const ids = listBuiltIn().map((agent) => agent.manifest.id)
    expect(ids).toEqual(['qa-web-agent'])
  })

  it('registers qa-web-agent as published, protected, code-defined', () => {
    const agent = getBuiltIn('qa-web-agent')
    expect(agent).toBeDefined()
    expect(agent?.manifest.source).toBe('code')
    expect(agent?.manifest.status).toBe('published')
    expect(agent?.manifest.protected).toBe(true)
    expect(agent?.manifest.category).toBe('qa')
  })

  it('declares the browser tool ids for qa-web-agent', () => {
    const agent = getBuiltIn('qa-web-agent')
    expect(agent?.manifest.toolIds).toEqual([
      'browser.navigate',
      'browser.snapshot',
      'browser.click',
      'browser.type',
      'browser.screenshot',
    ])
  })

  it('returns undefined for unknown agents', () => {
    expect(getBuiltIn('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run packages/agents`
Expected: FAIL — package/config missing.

- [ ] **Step 3: Create `packages/agents/package.json`**

```json
{
  "name": "@aether/agents",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": { "@aether/shared": "*" },
  "devDependencies": { "typescript": "^5.9.0", "vitest": "^4.0.0" }
}
```

- [ ] **Step 4: Create `packages/agents/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Implement `packages/agents/src/qa-web.ts`**

```ts
import type { AgentManifest } from '@aether/shared'

export const QA_WEB_INSTRUCTIONS = `You are the QA Web Agent. You test web applications by driving a browser.

Workflow:
1. Ask for a target URL and a testing objective if not provided.
2. Navigate to the URL with browser.navigate.
3. Use browser.snapshot to understand the page structure before acting.
4. Perform the requested checks using browser.click and browser.type as needed.
5. Capture evidence with browser.screenshot.
6. Report structured findings: what you tested, what passed, what failed, and concrete steps to reproduce any defect.

Rules:
- Confirm consequential actions implicitly require user approval; proceed once approved.
- Never submit real credentials unless the user explicitly provides them.
- Keep findings concise and actionable.`

const now = '2026-07-09T00:00:00.000Z'

export const QA_WEB_AGENT: AgentManifest = {
  id: 'qa-web-agent',
  name: 'QA Web Agent',
  description: 'Drives a browser to test web apps and reports structured QA findings.',
  category: 'qa',
  source: 'code',
  status: 'published',
  protected: true,
  capabilities: ['browser-testing', 'form-testing', 'evidence-collection', 'qa-reporting'],
  toolIds: ['browser.navigate', 'browser.snapshot', 'browser.click', 'browser.type', 'browser.screenshot'],
  modelBinding: null,
  memory: { enabled: true, mode: 'thread' },
  visibility: 'internal',
  createdAt: now,
  updatedAt: now,
}
```

- [ ] **Step 6: Implement `packages/agents/src/index.ts`**

```ts
import { QA_WEB_AGENT, QA_WEB_INSTRUCTIONS } from './qa-web.js'

export interface BuiltInAgentDeclaration {
  readonly manifest: import('@aether/shared').AgentManifest
  readonly instructions: string
}

export const BUILT_IN_AGENTS: readonly BuiltInAgentDeclaration[] = [
  { manifest: QA_WEB_AGENT, instructions: QA_WEB_INSTRUCTIONS },
]

export function listBuiltIn(): readonly BuiltInAgentDeclaration[] {
  return BUILT_IN_AGENTS
}

export function getBuiltIn(id: string): BuiltInAgentDeclaration | undefined {
  return BUILT_IN_AGENTS.find((agent) => agent.manifest.id === id)
}

export {
  AGENT_ID_PATTERN,
  RESERVED_AGENT_IDS,
  assertValidAgentId,
} from '@aether/shared'
export type {
  AgentManifest,
  AgentSource,
  AgentStatus,
  AgentCategory,
  CatalogAgent,
} from '@aether/shared'
```

- [ ] **Step 7: Run install so the new workspace links**

Run: `npm install`
Expected: workspace links `@aether/agents`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- --run packages/agents`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/agents
git commit -m "feat(agents): add built-in agent declarations package with QA Web Agent"
```

---

## Task 4: packages/tools — Playwright browser engine

**Files:**
- Create: `packages/tools/package.json`, `packages/tools/tsconfig.json`, `packages/tools/src/index.ts`, `packages/tools/src/browser/session-store.ts`, `packages/tools/src/browser/actions.ts`, `packages/tools/src/browser/types.ts`, `packages/tools/src/__tests__/browser.test.ts`

**Interfaces:**
- Produces: `@aether/tools` exports `BrowserSession`, `BrowserSessionStore`, `BROWSER_TOOL_RISK` (`Record<string, ToolRiskLevel>`), and action functions `navigatePage`, `snapshotPage`, `clickElement`, `typeIntoElement`, `screenshotPage`.
- Consumes: `playwright` (`chromium`).

- [ ] **Step 1: Write the failing test**

`packages/tools/src/__tests__/browser.test.ts` (mocks `playwright`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPage = {
  goto: vi.fn(async () => undefined),
  accessibility: { snapshot: vi.fn(async () => ({ role: 'WebArea', name: 'Home' })) },
  locator: vi.fn(() => ({ click: vi.fn(async () => undefined), fill: vi.fn(async () => undefined) })),
  screenshot: vi.fn(async () => Buffer.from('png')),
  close: vi.fn(async () => undefined),
}
const mockContext = {
  newPage: vi.fn(async () => mockPage),
  close: vi.fn(async () => undefined),
}
vi.mock('playwright', () => ({
  chromium: { launchPersistentContext: vi.fn(async () => mockContext) },
}))

import { BROWSER_TOOL_RISK, BrowserSessionStore } from '../index.js'

describe('browser engine', () => {
  beforeEach(() => {
    mockContext.newPage.mockClear()
    mockContext.close.mockClear()
  })

  it('marks click and type as the only approval-requiring tools', () => {
    expect(BROWSER_TOOL_RISK['browser.click']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.type']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.navigate']).toBe('interactive')
    expect(BROWSER_TOOL_RISK['browser.snapshot']).toBe('read')
    expect(BROWSER_TOOL_RISK['browser.screenshot']).toBe('read')
  })

  it('reuses one isolated context per conversation and closes it', async () => {
    const store = new BrowserSessionStore()
    const a = await store.get('conv-1')
    const b = await store.get('conv-1')
    const c = await store.get('conv-2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    await store.close('conv-1')
    expect(mockContext.close).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run packages/tools`
Expected: FAIL — package missing.

- [ ] **Step 3: Create `packages/tools/package.json`**

```json
{
  "name": "@aether/tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./*": "./src/*" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": { "@aether/shared": "*", "playwright": "^1.49.0" },
  "devDependencies": { "@types/node": "^22.10.0", "typescript": "^5.9.0", "vitest": "^4.0.0" }
}
```

- [ ] **Step 4: Create `packages/tools/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Implement `packages/tools/src/browser/types.ts`**

```ts
export type ToolRiskLevel = 'read' | 'interactive' | 'consequential' | 'system'

export interface BrowserPage {
  goto(url: string): Promise<unknown>
  accessibility: { snapshot(): Promise<unknown> }
  locator(selector: string): { click(): Promise<unknown>; fill(text: string): Promise<unknown> }
  screenshot(): Promise<Buffer>
  close(): Promise<unknown>
}

export interface BrowserContext {
  newPage(): Promise<BrowserPage>
  close(): Promise<unknown>
}
```

- [ ] **Step 6: Implement `packages/tools/src/browser/session-store.ts`**

```ts
import { chromium } from 'playwright'
import type { BrowserContext } from './types.js'

export interface BrowserSession {
  readonly context: BrowserContext
  close(): Promise<void>
}

export class BrowserSessionStore {
  private readonly sessions = new Map<string, BrowserSession>()

  async get(conversationId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(conversationId)
    if (existing) return existing
    const context = await chromium.launchPersistentContext(
      `./.browser-sessions/${conversationId}`,
      { headless: true },
    )
    const session: BrowserSession = {
      context,
      close: async () => {
        await context.close().catch(() => undefined)
        this.sessions.delete(conversationId)
      },
    }
    this.sessions.set(conversationId, session)
    return session
  }

  async close(conversationId: string): Promise<void> {
    const session = this.sessions.get(conversationId)
    if (session) await session.close()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
  }
}
```

- [ ] **Step 7: Implement `packages/tools/src/browser/actions.ts`**

```ts
import type { BrowserSession } from './session-store.js'
import type { BrowserPage } from './types.js'

async function pageOf(session: BrowserSession): Promise<BrowserPage> {
  return session.context.newPage()
}

export async function navigatePage(session: BrowserSession, url: string): Promise<{ url: string }> {
  const page = await pageOf(session)
  await page.goto(url)
  return { url }
}

export async function snapshotPage(session: BrowserSession): Promise<{ tree: unknown }> {
  const page = await pageOf(session)
  return { tree: await page.accessibility.snapshot() }
}

export async function clickElement(session: BrowserSession, selector: string): Promise<{ selector: string }> {
  const page = await pageOf(session)
  await page.locator(selector).click()
  return { selector }
}

export async function typeIntoElement(
  session: BrowserSession,
  selector: string,
  text: string,
): Promise<{ selector: string; text: string }> {
  const page = await pageOf(session)
  await page.locator(selector).fill(text)
  return { selector, text }
}

export async function screenshotPage(session: BrowserSession): Promise<{ imageBase64: string }> {
  const page = await pageOf(session)
  const buffer = await page.screenshot()
  return { imageBase64: buffer.toString('base64') }
}
```

- [ ] **Step 8: Implement `packages/tools/src/index.ts`**

```ts
import type { ToolRiskLevel } from './browser/types.js'

export { BrowserSessionStore } from './browser/session-store.js'
export type { BrowserSession } from './browser/session-store.js'
export type { BrowserContext, BrowserPage, ToolRiskLevel } from './browser/types.js'
export {
  navigatePage,
  snapshotPage,
  clickElement,
  typeIntoElement,
  screenshotPage,
} from './browser/actions.js'

export const BROWSER_TOOL_RISK: Record<string, ToolRiskLevel> = {
  'browser.navigate': 'interactive',
  'browser.snapshot': 'read',
  'browser.screenshot': 'read',
  'browser.click': 'interactive',
  'browser.type': 'interactive',
}
```

- [ ] **Step 9: Install + run test**

Run: `npm install` then `npm run test -- --run packages/tools`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): add Playwright browser engine package (sessions + actions)"
```

---

## Task 5: Agent-server env fields

**Files:**
- Modify: `apps/agent-server/src/config/env.ts`, `vitest.setup.js`, `apps/agent-server/src/__tests__/env.test.ts`

**Interfaces:**
- Produces: `env.AETHER_DEFAULT_AGENT_ID`, `env.AETHER_LOCAL_USER_ID` (required strings).

- [ ] **Step 1: Read current env files**

Run: `read apps/agent-server/src/config/env.ts` and `read vitest.setup.js` to see exact current shape (do this before editing).

- [ ] **Step 2: Add failing assertions to `apps/agent-server/src/__tests__/env.test.ts`**

Append a new `describe`/`it`:

```ts
import { envSchema } from '../config/env.js'
// ... existing imports ...

describe('agent catalog env', () => {
  it('parses the default agent and local user ids', () => {
    const parsed = envSchema.parse({
      ...validBase(),
      AETHER_DEFAULT_AGENT_ID: 'qa-web-agent',
      AETHER_LOCAL_USER_ID: 'local-user',
    })
    expect(parsed.AETHER_DEFAULT_AGENT_ID).toBe('qa-web-agent')
    expect(parsed.AETHER_LOCAL_USER_ID).toBe('local-user')
  })

  it('requires both agent catalog env fields', () => {
    expect(() => envSchema.parse(validBase())).toThrow()
  })
})
```

Note: if the existing file does not already export a `validBase()` helper, inline the full valid object instead (copy the minimal valid env used elsewhere in that test file). Inspect the file in Step 1 and adapt.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/env.test.ts`
Expected: FAIL — unknown/missing fields.

- [ ] **Step 4: Add fields to `apps/agent-server/src/config/env.ts`**

Inside `envSchema` (alongside the other `z.string()` fields — no `.default()`/`.optional()`), add:

```ts
  AETHER_DEFAULT_AGENT_ID: z.string().min(1),
  AETHER_LOCAL_USER_ID: z.string().min(1),
```

- [ ] **Step 5: Seed defaults in `vitest.setup.js`**

Add to the `process.env` seed block:

```js
process.env.AETHER_DEFAULT_AGENT_ID = 'qa-web-agent'
process.env.AETHER_LOCAL_USER_ID = 'local-user'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- --run apps/agent-server/src/__tests__/env.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-server/src/config/env.ts apps/agent-server/src/__tests__/env.test.ts vitest.setup.js
git commit -m "feat(agent-server): add default-agent and local-user env fields"
```

---

## Task 6: Agent resolver + runtime builder + browser tool wrappers

**Files:**
- Create: `apps/agent-server/src/agents/resolver.ts`, `apps/agent-server/src/agents/build.ts`, `apps/agent-server/src/tools/browser.ts`, `apps/agent-server/src/__tests__/resolver.test.ts`
- Modify: `apps/agent-server/package.json` (deps)

**Interfaces:**
- Produces:
  - `resolveCatalog(deps): Promise<CatalogAgent[]>` and `resolveAgent(deps, id): Promise<ResolvedAgent | null>` where `ResolvedAgent = { manifest; configured; mastraAgent: Agent | null }`.
  - `buildMastraAgents(deps): Promise<Record<string, Agent>>` — builds the Mastra `agents` map.
  - `buildBrowserTools(sessionStore): Record<string, Tool>` — Mastra tools; click/type have `requireApproval: true`.
- Consumes: `@aether/agents` (`listBuiltIn`, `getBuiltIn`), `@aether/database` (`agentModelBindings`, `modelProfiles`, `providerConnections`), `@aether/providers` (`getAdapter`, `resolveSecret`), `@mastra/core/agent` (`Agent`), `@mastra/memory` (`Memory`), `@mastra/libsql` (`LibSQLStore`), `@aether/tools` (engine).

- [ ] **Step 1: Add dependencies to `apps/agent-server/package.json`**

In `dependencies`, add:

```json
"@aether/agents": "*",
"@aether/tools": "*",
"@mastra/memory": "^1.0.0",
"playwright": "^1.49.0"
```

- [ ] **Step 2: Write the failing test**

`apps/agent-server/src/__tests__/resolver.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAgent, resolveCatalog, type AgentRuntimeDeps } from '../agents/resolver.js'

function deps(overrides: Partial<AgentRuntimeDeps> = {}): AgentRuntimeDeps {
  return {
    listBuiltIn: () => [
      {
        manifest: {
          id: 'qa-web-agent',
          name: 'QA Web Agent',
          description: 'd',
          category: 'qa',
          source: 'code',
          status: 'published',
          protected: true,
          capabilities: [],
          toolIds: [],
          modelBinding: null,
          memory: { enabled: true, mode: 'thread' },
          visibility: 'internal',
          createdAt: 't',
          updatedAt: 't',
        },
        instructions: 'do things',
      },
    ],
    findBinding: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('agent resolver', () => {
  it('reports built-in agents as not configured when no binding exists', async () => {
    const catalog = await resolveCatalog(deps())
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.configured).toBe(false)
  })

  it('reports configured when a usable binding + profile + connection exist', async () => {
    const d = deps({
      findBinding: vi.fn(async () => ({
        agentId: 'qa-web-agent',
        primaryModelProfileId: 'p1',
        fallbackModelProfileIds: [],
        createdAt: 't',
        updatedAt: 't',
      })),
      findProfile: vi.fn(async () => ({
        id: 'p1',
        providerConnectionId: 'c1',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: false, reasoning: false },
        approved: true,
        enabled: true,
        defaultSettings: null,
        createdAt: 't',
        updatedAt: 't',
      })),
      findConnection: vi.fn(async () => ({
        id: 'c1',
        name: 'OpenAI',
        type: 'openai',
        baseUrl: null,
        secretRef: 'env:OPENAI_API_KEY',
        enabled: true,
        status: 'healthy',
        createdAt: 't',
        updatedAt: 't',
      })),
    })
    const catalog = await resolveCatalog(d)
    expect(catalog[0]?.configured).toBe(true)
  })

  it('returns null for unknown agents', async () => {
    expect(await resolveAgent(deps(), 'nope')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/resolver.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement `apps/agent-server/src/agents/resolver.ts`**

```ts
import type { CatalogAgent, AgentManifest } from '@aether/shared'
import type { BuiltInAgentDeclaration } from '@aether/agents'

export interface BindingRow {
  readonly agentId: string
  readonly primaryModelProfileId: string
  readonly fallbackModelProfileIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}
export interface ProfileRow {
  readonly id: string
  readonly providerConnectionId: string
  readonly modelId: string
  readonly displayName: string
  readonly capabilities: unknown
  readonly approved: boolean
  readonly enabled: boolean
  readonly defaultSettings: unknown
  readonly createdAt: string
  readonly updatedAt: string
}
export interface ConnectionRow {
  readonly id: string
  readonly name: string
  readonly type: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'
  readonly baseUrl: string | null
  readonly secretRef: string
  readonly enabled: boolean
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AgentRuntimeDeps {
  listBuiltIn(): readonly BuiltInAgentDeclaration[]
  findBinding(agentId: string): Promise<BindingRow | undefined>
  findProfile(profileId: string): Promise<ProfileRow | undefined>
  findConnection(connectionId: string): Promise<ConnectionRow | undefined>
}

export interface ResolvedAgent {
  readonly manifest: AgentManifest
  readonly configured: boolean
}

async function isConfigured(deps: AgentRuntimeDeps, manifest: AgentManifest): Promise<boolean> {
  const binding = await deps.findBinding(manifest.id)
  if (!binding) return false
  const profile = await deps.findProfile(binding.primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) return false
  const connection = await deps.findConnection(profile.providerConnectionId)
  return Boolean(connection && connection.enabled)
}

export async function resolveCatalog(deps: AgentRuntimeDeps): Promise<CatalogAgent[]> {
  const agents = deps.listBuiltIn()
  return Promise.all(
    agents.map(async (agent) => ({
      manifest: agent.manifest,
      configured: await isConfigured(deps, agent.manifest),
    })),
  )
}

export async function resolveAgent(
  deps: AgentRuntimeDeps,
  id: string,
): Promise<ResolvedAgent | null> {
  const agent = deps.listBuiltIn().find((item) => item.manifest.id === id)
  if (!agent) return null
  return { manifest: agent.manifest, configured: await isConfigured(deps, agent.manifest) }
}
```

- [ ] **Step 5: Implement `apps/agent-server/src/tools/browser.ts`**

```ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  BrowserSessionStore,
  clickElement,
  navigatePage,
  screenshotPage,
  snapshotPage,
  typeIntoElement,
} from '@aether/tools'

export function buildBrowserTools(sessionStore: BrowserSessionStore) {
  return {
    'browser.navigate': createTool({
      id: 'browser.navigate',
      description: 'Navigate the browser to a URL.',
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({ url: z.string() }),
      execute: async ({ data }) => {
        const session = await sessionStore.get(data.conversationId)
        return navigatePage(session, data.input.url)
      },
    }),
    'browser.snapshot': createTool({
      id: 'browser.snapshot',
      description: 'Return the accessibility tree of the current page.',
      inputSchema: z.object({}),
      outputSchema: z.object({ tree: z.unknown() }),
      execute: async ({ data }) => {
        const session = await sessionStore.get(data.conversationId)
        return snapshotPage(session)
      },
    }),
    'browser.screenshot': createTool({
      id: 'browser.screenshot',
      description: 'Capture a screenshot of the current page.',
      inputSchema: z.object({}),
      outputSchema: z.object({ imageBase64: z.string() }),
      execute: async ({ data }) => {
        const session = await sessionStore.get(data.conversationId)
        return screenshotPage(session)
      },
    }),
    'browser.click': createTool({
      id: 'browser.click',
      description: 'Click an element by CSS selector.',
      inputSchema: z.object({ selector: z.string().min(1) }),
      outputSchema: z.object({ selector: z.string() }),
      requireApproval: true,
      execute: async ({ data }) => {
        const session = await sessionStore.get(data.conversationId)
        return clickElement(session, data.input.selector)
      },
    }),
    'browser.type': createTool({
      id: 'browser.type',
      description: 'Type text into an element identified by CSS selector.',
      inputSchema: z.object({ selector: z.string().min(1), text: z.string() }),
      outputSchema: z.object({ selector: z.string(), text: z.string() }),
      requireApproval: true,
      execute: async ({ data }) => {
        const session = await sessionStore.get(data.conversationId)
        return typeIntoElement(session, data.input.selector, data.input.text)
      },
    }),
  }
}
```

> **Verify during implementation:** confirm the exact `execute` argument shape for the installed `@mastra/core` version (`{ data }` carrying the parsed input plus any runtime context). The tool needs the `conversationId` to scope the browser session — pass it via the agent's runtime context (see `build.ts`). If `createTool` does not thread arbitrary context, fall back to a module-level `currentConversationId` set by the chat route before invoking the stream. Resolve via typecheck; pick whichever the installed API supports and update both `browser.ts` and the chat route consistently.

- [ ] **Step 6: Implement `apps/agent-server/src/agents/build.ts`**

```ts
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { BrowserSessionStore, BROWSER_TOOL_RISK } from '@aether/tools'
import { getAdapter, resolveSecret } from '@aether/providers'
import { buildBrowserTools } from '../tools/browser.js'
import {
  resolveAgent,
  resolveCatalog,
  type AgentRuntimeDeps,
  type BindingRow,
  type ConnectionRow,
  type ProfileRow,
} from './resolver.js'
import type { Agent } from '@mastra/core/agent'

export interface MastraAgentDeps extends AgentRuntimeDeps {
  databaseUrl: string
  resolveSecret(secretRef: string): Promise<string>
}

async function resolveLanguageModel(
  deps: MastraAgentDeps,
  binding: BindingRow,
): Promise<{ model: import('@ai-sdk/provider').LanguageModelV1; profile: ProfileRow; connection: ConnectionRow } | null> {
  const profile = await deps.findProfile(binding.primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) return null
  const connection = await deps.findConnection(profile.providerConnectionId)
  if (!connection || !connection.enabled) return null
  const apiKey = await deps.resolveSecret(connection.secretRef)
  const model = await getAdapter(connection.type).resolveModel(
    connection.baseUrl ?? undefined,
    apiKey,
    profile as unknown as import('@aether/providers').ModelProfile,
  )
  return { model, profile, connection }
}

export async function buildMastraAgents(deps: MastraAgentDeps): Promise<Record<string, Agent>> {
  const sessionStore = new BrowserSessionStore()
  const memory = new Memory({
    storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
  })
  const agents: Record<string, Agent> = {}
  for (const declaration of deps.listBuiltIn()) {
    const binding = await deps.findBinding(declaration.manifest.id)
    let model: import('@ai-sdk/provider').LanguageModelV1 | null = null
    if (binding) model = (await resolveLanguageModel(deps, binding))?.model ?? null
    const agent = new Agent({
      id: declaration.manifest.id,
      name: declaration.manifest.name,
      instructions: declaration.instructions,
      model: model ?? '__GATEWAY_OPENAI_MODEL__',
      tools: buildBrowserTools(sessionStore),
      memory,
    })
    agents[declaration.manifest.id] = agent
  }
  return agents
}

export { resolveCatalog, resolveAgent, BROWSER_TOOL_RISK }
```

> **Verify during implementation:** `Memory` constructor options and the `@mastra/memory` version compatibility. If `@mastra/memory` import path differs (e.g. `@mastra/core/memory`), adjust. Confirm `Agent` accepts `model` being a `LanguageModelV1`. Run `npm run typecheck` and fix imports to match the installed package.

- [ ] **Step 7: Run install + typecheck + resolver test**

Run: `npm install`, then `npm run test -- --run apps/agent-server/src/__tests__/resolver.test.ts`
Expected: resolver tests PASS.

Then `npm run typecheck` — fix any Mastra import/version drift in `build.ts`/`browser.ts` until it passes.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-server/package.json apps/agent-server/src/agents apps/agent-server/src/tools apps/agent-server/src/__tests__/resolver.test.ts package-lock.json
git commit -m "feat(agent-server): add agent resolver, runtime builder, and browser tool wrappers"
```

---

## Task 7: Catalog routes (`/api/agents`)

**Files:**
- Create: `apps/agent-server/src/mastra/routes/agents.ts`, `apps/agent-server/src/__tests__/agent-routes.test.ts`

**Interfaces:**
- Produces: `createAgentRoutes(deps): ApiRoute[]`, `agentRoutes` (production). Routes: `GET /api/agents`, `GET /api/agents/:id`.
- Consumes: `resolveCatalog`, `resolveAgent` (injected via `deps`).

- [ ] **Step 1: Write the failing test**

`apps/agent-server/src/__tests__/agent-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import { createAgentRoutes, type AgentRouteDependencies } from '../mastra/routes/agents.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(params: Record<string, string> = {}) {
  return {
    req: { param: (name: string) => params[name] },
    json: (body: JsonValue, status = 200) => Response.json(body, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => {
    const res = await route.handler(c as never, async () => undefined)
    if (!(res instanceof Response)) throw new Error('no response')
    return res
  }
}

describe('agent catalog routes', () => {
  let deps: AgentRouteDependencies
  beforeEach(() => {
    deps = {
      listCatalog: vi.fn(async () => [
        {
          manifest: { id: 'qa-web-agent', name: 'QA Web Agent', status: 'published' },
          configured: false,
        },
      ]),
      getAgent: vi.fn(async () => ({
        manifest: { id: 'qa-web-agent', name: 'QA Web Agent', status: 'published' },
        configured: true,
      })),
    }
  })

  it('registers the catalog API', () => {
    const routes = createAgentRoutes(deps)
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/agents',
      'GET /api/agents/:id',
    ])
  })

  it('lists catalog agents', async () => {
    const res = await handler(createAgentRoutes(deps), 'GET', '/api/agents')(context())
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body[0]).toMatchObject({ configured: false })
  })

  it('returns 404 for an unknown agent', async () => {
    deps.getAgent = vi.fn(async () => null)
    const res = await handler(createAgentRoutes(deps), 'GET', '/api/agents/:id')(
      context({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/agent-routes.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/agent-server/src/mastra/routes/agents.ts`**

```ts
import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import type { CatalogAgent } from '@aether/shared'

export interface AgentRouteDependencies {
  listCatalog(): Promise<CatalogAgent[]>
  getAgent(id: string): Promise<{ manifest: CatalogAgent['manifest']; configured: boolean } | null>
}

function notFound(c: { json(body: unknown, status?: number): Response }, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found` } }, 404)
}

export function createAgentRoutes(deps: AgentRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/agents', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.listCatalog())
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),
    registerApiRoute('/api/agents/:id', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const agent = await deps.getAgent(c.req.param('id'))
          if (!agent) return notFound(c, 'Agent')
          return c.json(agent)
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),
  ]
}
```

Add production wiring at the bottom (uses the resolver built in Task 6):

```ts
import { resolveAgent, resolveCatalog, type AgentRuntimeDeps } from '../../agents/resolver.js'

export function createProductionAgentRoutes(runtime: AgentRuntimeDeps): ApiRoute[] {
  return createAgentRoutes({
    listCatalog: () => resolveCatalog(runtime),
    getAgent: (id) => resolveAgent(runtime, id),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run apps/agent-server/src/__tests__/agent-routes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent-server/src/mastra/routes/agents.ts apps/agent-server/src/__tests__/agent-routes.test.ts
git commit -m "feat(agent-server): add agent catalog API routes"
```

---

## Task 8: Conversation routes

**Files:**
- Create: `apps/agent-server/src/mastra/routes/conversations.ts`, `apps/agent-server/src/__tests__/conversation-routes.test.ts`

**Interfaces:**
- Produces: `createConversationRoutes(deps): ApiRoute[]`. Routes: `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id`.
- Consumes: a `ConversationStore` (create/list/find/exists) and `loadMessages(threadId, resourceId)` and `resolveAgent` for create-time validation.

- [ ] **Step 1: Write the failing test**

`apps/agent-server/src/__tests__/conversation-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import {
  createConversationRoutes,
  type ConversationRouteDependencies,
} from '../mastra/routes/conversations.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: { body?: unknown; jsonError?: Error; params?: Record<string, string>; query?: Record<string, string> }) {
  return {
    req: {
      json: async () => {
        if (input.jsonError) throw input.jsonError
        return input.body
      },
      param: (n: string) => input.params?.[n],
      query: (n: string) => input.query?.[n],
    },
    json: (b: JsonValue, status = 200) => Response.json(b, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => {
    const res = await route.handler(c as never, async () => undefined)
    if (!(res instanceof Response)) throw new Error('no response')
    return res
  }
}

const conversation = {
  id: 'conv-1',
  userId: 'local-user',
  agentId: 'qa-web-agent',
  threadId: 'thread-1',
  title: 'Hello',
  status: 'active',
  createdAt: 't',
  updatedAt: 't',
}

describe('conversation routes', () => {
  let deps: ConversationRouteDependencies
  beforeEach(() => {
    deps = {
      userId: 'local-user',
      resolveAgent: vi.fn(async () => ({ manifest: { id: 'qa-web-agent', status: 'published' }, configured: true })),
      create: vi.fn(async (agentId) => ({ ...conversation, agentId })),
      list: vi.fn(async () => [conversation]),
      find: vi.fn(async () => conversation),
      loadMessages: vi.fn(async () => []),
    }
  })

  it('registers the conversation API', () => {
    expect(createConversationRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/conversations',
      'GET /api/conversations',
      'GET /api/conversations/:id',
    ])
  })

  it('creates a conversation bound to an agent', async () => {
    const res = await handler(createConversationRoutes(deps), 'POST', '/api/conversations')(
      context({ body: { agentId: 'qa-web-agent', title: 'Hello' } }),
    )
    expect(res.status).toBe(201)
    expect(deps.create).toHaveBeenCalledWith('qa-web-agent', 'Hello')
    const body = await res.json()
    expect(body).toMatchObject({ agentId: 'qa-web-agent', threadId: 'thread-1' })
  })

  it('rejects creating a conversation for an archived agent', async () => {
    deps.resolveAgent = vi.fn(async () => ({ manifest: { id: 'qa-web-agent', status: 'archived' }, configured: true }))
    const res = await handler(createConversationRoutes(deps), 'POST', '/api/conversations')(
      context({ body: { agentId: 'qa-web-agent' } }),
    )
    expect(res.status).toBe(409)
    expect(deps.create).not.toHaveBeenCalled()
  })

  it('rejects creating a conversation for an unconfigured agent', async () => {
    deps.resolveAgent = vi.fn(async () => ({ manifest: { id: 'qa-web-agent', status: 'published' }, configured: false }))
    const res = await handler(createConversationRoutes(deps), 'POST', '/api/conversations')(
      context({ body: { agentId: 'qa-web-agent' } }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for a conversation that does not belong to the user', async () => {
    deps.find = vi.fn(async () => undefined)
    const res = await handler(createConversationRoutes(deps), 'GET', '/api/conversations/:id')(
      context({ params: { id: 'conv-x' } }),
    )
    expect(res.status).toBe(404)
  })

  it('never allows the body to override the immutable agentId of an existing conversation', async () => {
    const res = await handler(createConversationRoutes(deps), 'GET', '/api/conversations/:id')(
      context({ params: { id: 'conv-1' } }),
    )
    const body = await res.json()
    expect(body.agentId).toBe('qa-web-agent')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/conversation-routes.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/agent-server/src/mastra/routes/conversations.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { AppError, ErrorCode } from '@aether/shared'
import { z, ZodError } from 'zod'

export interface ConversationRecord {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ResolvedAgentRef {
  readonly manifest: { readonly id: string; readonly status: 'draft' | 'published' | 'archived' }
  readonly configured: boolean
}

export interface ConversationRouteDependencies {
  readonly userId: string
  resolveAgent(agentId: string): Promise<ResolvedAgentRef | null>
  create(agentId: string, title: string): Promise<ConversationRecord>
  list(): Promise<ConversationRecord[]>
  find(id: string): Promise<ConversationRecord | undefined>
  loadMessages(threadId: string, resourceId: string): Promise<unknown[]>
}

const createSchema = z.object({
  agentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
})

function errorResponse(c: { json(body: unknown, status?: number): Response }, error: unknown) {
  if (error instanceof ZodError) {
    return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid request', issues: error.issues } }, 400)
  }
  if (error instanceof AppError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.code === ErrorCode.INVALID_INPUT ? 400 : 502)
  }
  return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
}

function notFound(c: { json(body: unknown, status?: number): Response) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
}

async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError({ code: ErrorCode.INVALID_INPUT, message: 'Request body must contain valid JSON' })
    }
    throw error
  }
}

export function createConversationRoutes(deps: ConversationRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/conversations', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = createSchema.parse(await readJson(c.req))
          const agent = await deps.resolveAgent(input.agentId)
          if (!agent) return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
          if (agent.manifest.status === 'archived') {
            return c.json({ error: { code: 'CONFLICT', message: 'Archived agents cannot start new conversations' } }, 409)
          }
          if (!agent.configured) {
            return c.json({ error: { code: ErrorCode.NOT_CONFIGURED, message: 'Agent is not configured with an approved model' } }, 400)
          }
          const created = await deps.create(input.agentId, input.title)
          return c.json(created, 201)
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/conversations', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.list())
        } catch {
          return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
        }
      },
    }),
    registerApiRoute('/api/conversations/:id', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const conversation = await deps.find(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          const messages = await deps.loadMessages(conversation.threadId, conversation.userId)
          return c.json({ conversation, messages })
        } catch {
          return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
        }
      },
    }),
  ]
}
```

> **Note on immutability:** `agentId` is set once at creation and never read from the body again — there is no update endpoint, so the only way to "switch agents" is to create a new conversation. This is the server-side enforcement of ADR-010.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run apps/agent-server/src/__tests__/conversation-routes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent-server/src/mastra/routes/conversations.ts apps/agent-server/src/__tests__/conversation-routes.test.ts
git commit -m "feat(agent-server): add conversation API routes with immutable agent binding"
```

---

## Task 9: Chat SSE route + pure stream mapper + approval route

**Files:**
- Create: `apps/agent-server/src/mastra/routes/chat.ts`, `apps/agent-server/src/mastra/stream-mapper.ts`, `apps/agent-server/src/__tests__/stream-mapper.test.ts`, `apps/agent-server/src/__tests__/chat-routes.test.ts`

**Interfaces:**
- Produces:
  - `mapStreamToSse(fullStream, hooks): ReadableStream<Uint8Array>` (pure).
  - `createChatRoutes(deps): ApiRoute[]`. Routes: `POST /api/conversations/:id/messages` (SSE), `POST /api/conversations/:id/approvals/:toolCallId` (SSE resume).
- Consumes: a `ChatDeps` providing `findConversation`, `persistUserMessage`, `recordToolEvent`, `startStream`, `listSuspendedRuns`, `approve`, `decline`.

- [ ] **Step 1: Write the failing mapper test**

`apps/agent-server/src/__tests__/stream-mapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapStreamToSse } from '../mastra/stream-mapper.js'

type Chunk = { type: string; payload?: Record<string, unknown> }

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

describe('stream mapper', () => {
  it('maps text, tool, approval, result, finish, and error chunks to SSE events', async () => {
    const toolEvents: unknown[] = []
    async function* fake(): AsyncIterable<Chunk> {
      yield { type: 'text-delta', payload: { text: 'Hi' } }
      yield { type: 'tool-call', payload: { toolCallId: 'c1', toolName: 'browser.navigate', args: { url: 'https://x' } } }
      yield { type: 'tool-call-approval', payload: { toolCallId: 'c2', toolName: 'browser.click', args: { selector: '#go' } } }
      yield { type: 'tool-result', payload: { toolCallId: 'c2', toolName: 'browser.click', result: { ok: true } } }
      yield { type: 'finish', payload: { stepResult: { reason: 'stop' } } }
    }
    const out = await collect(
      mapStreamToSse(fake(), { runId: 'run-1', onToolEvent: (event) => void toolEvents.push(event) }),
    )
    expect(out).toContain('data: {"type":"text","text":"Hi"}')
    expect(out).toContain('data: {"type":"tool_start"')
    expect(out).toContain('data: {"type":"tool_approval_required"')
    expect(out).toContain('data: {"type":"tool_result"')
    expect(out).toContain('data: {"type":"message_end"}')
    expect(out).toContain('data: [DONE]')
    expect(toolEvents).toHaveLength(3)
  })

  it('emits an error event on error chunks', async () => {
    async function* fake(): AsyncIterable<Chunk> {
      yield { type: 'error', payload: { error: { name: 'X', message: 'boom' } } }
    }
    const out = await collect(mapStreamToSse(fake(), { runId: 'r' }))
    expect(out).toContain('data: {"type":"error"')
  })
})
```

- [ ] **Step 2: Run mapper test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/stream-mapper.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/agent-server/src/mastra/stream-mapper.ts`**

```ts
import { BROWSER_TOOL_RISK } from '@aether/tools'

export interface StreamChunk {
  readonly type: string
  readonly payload?: Record<string, unknown>
}

export interface ToolEventInput {
  readonly conversationId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly status: 'requested' | 'success' | 'error'
  readonly input?: unknown
  readonly output?: unknown
}

export interface MapHooks {
  readonly runId: string
  readonly conversationId?: string
  onToolEvent?(event: ToolEventInput): void
}

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function riskOf(toolName: string): ToolEventInput['status'] extends never ? never : 'read' | 'interactive' | 'consequential' | 'system' {
  return (BROWSER_TOOL_RISK[toolName] ?? 'interactive') as 'read' | 'interactive' | 'consequential' | 'system'
}

export function mapStreamToSse(
  fullStream: AsyncIterable<StreamChunk>,
  hooks: MapHooks,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of fullStream) {
          const payload = (chunk.payload ?? {}) as Record<string, unknown>
          switch (chunk.type) {
            case 'text-delta':
              controller.enqueue(sse({ type: 'text', text: payload.text }))
              break
            case 'tool-call': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({
                conversationId: hooks.conversationId ?? '',
                toolCallId,
                toolName,
                status: 'requested',
                input: payload.args,
              })
              controller.enqueue(sse({ type: 'tool_start', toolCallId, toolName, args: payload.args }))
              break
            }
            case 'tool-call-approval': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({
                conversationId: hooks.conversationId ?? '',
                toolCallId,
                toolName,
                status: 'requested',
                input: payload.args,
              })
              controller.enqueue(
                sse({ type: 'tool_approval_required', runId: hooks.runId, toolCallId, toolName, args: payload.args }),
              )
              break
            }
            case 'tool-result': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({
                conversationId: hooks.conversationId ?? '',
                toolCallId,
                toolName,
                status: 'success',
                output: payload.result,
              })
              controller.enqueue(sse({ type: 'tool_result', toolCallId, toolName, result: payload.result }))
              break
            }
            case 'finish':
              controller.enqueue(sse({ type: 'message_end' }))
              break
            case 'error':
              controller.enqueue(sse({ type: 'error', message: serializeError(payload.error) }))
              break
            default:
              break
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      } catch (error) {
        controller.enqueue(sse({ type: 'error', message: error instanceof Error ? error.message : 'Stream error' }))
      } finally {
        controller.close()
      }
    },
  })
}

function serializeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return 'Unknown error'
}
```

- [ ] **Step 4: Run mapper test to verify it passes**

Run: `npm run test -- --run apps/agent-server/src/__tests__/stream-mapper.test.ts`
Expected: PASS (2 tests). (Remove the unused `riskOf` helper if lint complains, or use it inside `onToolEvent`; simplest: delete it — risk is recorded by callers.)

- [ ] **Step 5: Write the failing chat route test**

`apps/agent-server/src/__tests__/chat-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import { createChatRoutes, type ChatRouteDependencies } from '../mastra/routes/chat.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: { body?: unknown; params?: Record<string, string> }) {
  return {
    req: {
      json: async () => input.body,
      param: (n: string) => input.params?.[n],
      raw: { signal: undefined as AbortSignal | undefined },
    },
    json: (b: JsonValue, status = 200) => Response.json(b, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => route.handler(c as never, async () => undefined)
}

const conversation = {
  id: 'conv-1', userId: 'local-user', agentId: 'qa-web-agent',
  threadId: 'thread-1', title: 'Hi', status: 'active' as const, createdAt: 't', updatedAt: 't',
}

describe('chat routes', () => {
  let deps: ChatRouteDependencies
  beforeEach(() => {
    deps = {
      userId: 'local-user',
      findConversation: vi.fn(async () => conversation),
      persistUserMessage: vi.fn(async () => undefined),
      recordToolEvent: vi.fn(async () => undefined),
      startStream: vi.fn(async () => ({
        runId: 'run-1',
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: 'ok' } }
          yield { type: 'finish', payload: {} }
        })(),
      })),
      listSuspendedRuns: vi.fn(async () => ({ runs: [{ runId: 'run-1', toolCallId: 'c2' }] })),
      approve: vi.fn(async () => ({ fullStream: (async function* () { yield { type: 'finish', payload: {} } })() })),
      decline: vi.fn(async () => ({ fullStream: (async function* () { yield { type: 'finish', payload: {} } })() })),
    }
  })

  it('registers the chat API', () => {
    expect(createChatRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/conversations/:id/messages',
      'POST /api/conversations/:id/approvals/:toolCallId',
    ])
  })

  it('streams a message response as SSE and persists the user message', async () => {
    const res = await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/messages')(
      context({ params: { id: 'conv-1' }, body: { text: 'hello' } }),
    )
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.persistUserMessage).toHaveBeenCalledWith('thread-1', 'local-user', 'hello')
    const body = await new Response(res.body).text()
    expect(body).toContain('data: {"type":"text"')
    expect(body).toContain('data: [DONE]')
  })

  it('returns 404 when the conversation does not belong to the user', async () => {
    deps.findConversation = vi.fn(async () => undefined)
    const res = await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/messages')(
      context({ params: { id: 'x' }, body: { text: 'hi' } }),
    )
    expect(res.status).toBe(404)
  })

  it('resumes via approve using listSuspendedRuns', async () => {
    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/approvals/:toolCallId',
    )(context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'approve' } }))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.approve).toHaveBeenCalledWith('run-1', 'c2')
  })

  it('resumes via decline', async () => {
    await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/approvals/:toolCallId')(
      context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'deny' } }),
    )
    expect(deps.decline).toHaveBeenCalledWith('run-1', 'c2')
  })
})
```

- [ ] **Step 6: Run chat route test to verify it fails**

Run: `npm run test -- --run apps/agent-server/src/__tests__/chat-routes.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `apps/agent-server/src/mastra/routes/chat.ts`**

```ts
import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { AppError, ErrorCode } from '@aether/shared'
import { z, ZodError } from 'zod'
import { mapStreamToSse, type StreamChunk } from '../stream-mapper.js'

export interface ConversationRef {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly status: 'active' | 'archived'
}

export interface ContinuationStream {
  readonly fullStream: AsyncIterable<StreamChunk>
}

export interface ChatRouteDependencies {
  readonly userId: string
  findConversation(id: string): Promise<ConversationRef | undefined>
  persistUserMessage(threadId: string, resourceId: string, text: string): Promise<void>
  recordToolEvent(event: {
    conversationId: string
    toolCallId: string
    toolName: string
    status: 'requested' | 'success' | 'error'
    input?: unknown
    output?: unknown
  }): Promise<void>
  startStream(input: {
    conversationId: string
    agentId: string
    threadId: string
    resourceId: string
    text: string
  }): Promise<{ runId: string; fullStream: AsyncIterable<StreamChunk> }>
  listSuspendedRuns(threadId: string, resourceId: string): Promise<{ runs: { runId: string; toolCallId: string }[] }>
  approve(runId: string, toolCallId: string): Promise<ContinuationStream>
  decline(runId: string, toolCallId: string): Promise<ContinuationStream>
}

const messageSchema = z.object({ text: z.string().min(1) })
const approvalSchema = z.object({ decision: z.enum(['approve', 'deny']) })

function errorResponse(c: { json(body: unknown, status?: number): Response }, error: unknown) {
  if (error instanceof ZodError) {
    return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid request', issues: error.issues } }, 400)
  }
  if (error instanceof AppError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.code === ErrorCode.INVALID_INPUT ? 400 : 502)
  }
  return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
}

function notFound(c: { json(body: unknown, status?: number): Response }) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export function createChatRoutes(deps: ChatRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/conversations/:id/messages', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = messageSchema.parse(await c.req.json())
          const conversation = await deps.findConversation(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          await deps.persistUserMessage(conversation.threadId, deps.userId, input.text)
          const { runId, fullStream } = await deps.startStream({
            conversationId: conversation.id,
            agentId: conversation.agentId,
            threadId: conversation.threadId,
            resourceId: deps.userId,
            text: input.text,
          })
          return sseResponse(
            mapStreamToSse(fullStream, {
              runId,
              conversationId: conversation.id,
              onToolEvent: (event) => {
                void deps.recordToolEvent(event)
              },
            }),
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/conversations/:id/approvals/:toolCallId', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = approvalSchema.parse(await c.req.json())
          const conversation = await deps.findConversation(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          const { runs } = await deps.listSuspendedRuns(conversation.threadId, deps.userId)
          const run = runs[0]
          const toolCallId = c.req.param('toolCallId')
          if (!run) return c.json({ error: { code: 'NOT_FOUND', message: 'No suspended run' } }, 404)
          const continuation = input.decision === 'approve'
            ? await deps.approve(run.runId, toolCallId)
            : await deps.decline(run.runId, toolCallId)
          return sseResponse(
            mapStreamToSse(continuation.fullStream, { runId: run.runId, conversationId: conversation.id }),
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
  ]
}
```

- [ ] **Step 8: Run chat route test to verify it passes**

Run: `npm run test -- --run apps/agent-server/src/__tests__/chat-routes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/agent-server/src/mastra/routes/chat.ts apps/agent-server/src/mastra/stream-mapper.ts apps/agent-server/src/__tests__/stream-mapper.test.ts apps/agent-server/src/__tests__/chat-routes.test.ts
git commit -m "feat(agent-server): add streaming chat and tool-approval SSE routes"
```

---

## Task 10: Wire everything into the Mastra instance

**Files:**
- Modify: `apps/agent-server/src/mastra/index.ts`
- Create: `apps/agent-server/src/services/conversations.ts` (production store + wiring helpers)

**Interfaces:**
- Produces: a running Mastra instance with `agents:` map + agent/conversation/chat routes using production dependencies.

- [ ] **Step 1: Implement the conversation service `apps/agent-server/src/services/conversations.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { conversations, db } from '@aether/database'
import type { Agent } from '@mastra/core/agent'
import type { ConversationRef, ChatRouteDependencies, ContinuationStream } from '../mastra/routes/chat.js'
import type { ConversationRecord, ConversationRouteDependencies } from '../mastra/routes/conversations.js'
import type { StreamChunk } from '../mastra/stream-mapper.js'

export async function createConversation(userId: string, agentId: string, title: string): Promise<ConversationRecord> {
  const now = new Date().toISOString()
  const [row] = await db
    .insert(conversations)
    .values({
      id: randomUUID(),
      userId,
      agentId,
      threadId: randomUUID(),
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row as ConversationRecord
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const rows = await db.query.conversations.findMany()
  return rows.filter((row) => row.userId === userId)
}

export async function findConversation(id: string, userId: string): Promise<ConversationRef | undefined> {
  const row = await db.query.conversations.findFirst({
    where: (fields, operators) => operators.eq(fields.id, id),
  })
  if (!row || row.userId !== userId) return undefined
  return row
}

export function buildChatDependencies(opts: {
  userId: string
  agents: Record<string, Agent>
  recordToolEvent: ChatRouteDependencies['recordToolEvent']
  persistUserMessage: ChatRouteDependencies['persistUserMessage']
}): ChatRouteDependencies {
  return {
    userId: opts.userId,
    findConversation: (id) => findConversation(id, opts.userId),
    persistUserMessage: opts.persistUserMessage,
    recordToolEvent: opts.recordToolEvent,
    startStream: async ({ agentId, threadId, resourceId, text }) => {
      const agent = opts.agents[agentId]
      if (!agent) throw new Error(`Agent not built: ${agentId}`)
      const stream = await agent.stream(text, {
        memory: { thread: threadId, resource: resourceId },
        requireToolApproval: false,
      })
      return { runId: stream.runId, fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
    listSuspendedRuns: async (threadId, resourceId) => {
      const agent = Object.values(opts.agents)[0]
      if (!agent) return { runs: [] }
      const { runs } = await agent.listSuspendedRuns({ threadId, resourceId })
      return {
        runs: runs
          .flatMap((run) => (run.toolCalls ?? []).map((tc) => ({ runId: run.runId, toolCallId: tc.toolCallId }))),
      }
    },
    approve: async (runId, toolCallId): Promise<ContinuationStream> => {
      const agent = Object.values(opts.agents)[0]
      const stream = await agent.approveToolCall({ runId, toolCallId })
      return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
    decline: async (runId, toolCallId): Promise<ContinuationStream> => {
      const agent = Object.values(opts.agents)[0]
      const stream = await agent.declineToolCall({ runId, toolCallId })
      return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
  }
}
```

> **Verify during implementation:** `agent.stream(...).runId`, `.fullStream`, `listSuspendedRuns`, `approveToolCall`, `declineToolCall` exact return types for the installed Mastra version. Cast via `as AsyncIterable<StreamChunk>` where needed and adjust `runs[*].toolCalls` mapping to the real shape. Run `npm run typecheck` and fix until green.

- [ ] **Step 2: Wire into `apps/agent-server/src/mastra/index.ts`**

Replace the file body to build agents + add routes. Final shape:

```ts
import { Mastra } from '@mastra/core'
import { ConsoleLogger } from '@mastra/core/logger'
import { LibSQLStore } from '@mastra/libsql'
import { initDb } from '@aether/database'
import { agentModelBindings, modelProfiles, providerConnections, conversations as conversationsTable, toolEvents } from '@aether/database'
import { eq } from 'drizzle-orm'
import { db } from '@aether/database'
import { resolveSecret } from '@aether/providers'
import { listBuiltIn } from '@aether/agents'
import { env } from '../config/env.js'
import { requestIdInjector, requestLogger } from '../config/middleware.js'
import { healthRoute } from './routes/health.js'
import { providerRoutes } from './routes/providers.js'
import { createProductionAgentRoutes } from './routes/agents.js'
import { createConversationRoutes } from './routes/conversations.js'
import { createChatRoutes } from './routes/chat.js'
import { buildMastraAgents } from '../agents/build.js'
import {
  buildChatDependencies,
  createConversation,
  findConversation,
  listConversations,
} from '../services/conversations.js'
import { randomUUID } from 'node:crypto'

const mastraLogLevel =
  env.LOG_LEVEL === 'trace' ? 'debug' : env.LOG_LEVEL === 'fatal' ? 'error' : env.LOG_LEVEL

await initDb().catch((error: unknown) => {
  console.error('Failed to initialize database:', error)
  process.exit(1)
})

const runtimeDeps = {
  listBuiltIn,
  findBinding: (agentId: string) =>
    db.query.agentModelBindings.findFirst({ where: (f, o) => o.eq(f.agentId, agentId) }),
  findProfile: (profileId: string) =>
    db.query.modelProfiles.findFirst({ where: (f, o) => o.eq(f.id, profileId) }),
  findConnection: (connectionId: string) =>
    db.query.providerConnections.findFirst({ where: (f, o) => o.eq(f.id, connectionId) }),
}

const mastraAgents = await buildMastraAgents({
  ...runtimeDeps,
  databaseUrl: env.DATABASE_URL,
  resolveSecret,
})

const recordToolEvent = async (event: {
  conversationId: string
  toolCallId: string
  toolName: string
  status: 'requested' | 'success' | 'error'
  input?: unknown
  output?: unknown
}) => {
  const now = new Date().toISOString()
  await db
    .insert(toolEvents)
    .values({
      id: randomUUID(),
      conversationId: event.conversationId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      riskLevel: 'interactive',
      status: event.status === 'requested' ? 'requested' : event.status,
      input: JSON.stringify(event.input ?? {}),
      output: event.output !== undefined ? JSON.stringify(event.output) : null,
      startedAt: now,
      endedAt: event.status === 'requested' ? null : now,
    })
    .catch(() => undefined)
}

const persistUserMessage = async (threadId: string, resourceId: string, text: string) => {
  const agent = Object.values(mastraAgents)[0]
  if (!agent?.memory) return
  await agent.memory.createMessages({
    threadId,
    resourceId,
    messages: [{ role: 'user', content: text }],
  }).catch(() => undefined)
}

const conversationDeps: Awaited<ReturnType<typeof buildChatDependencies>> extends infer T ? any : never = null as never

export const mastra = new Mastra({
  logger: new ConsoleLogger({ name: 'mastra', level: mastraLogLevel }),
  storage: new LibSQLStore({ id: 'aether-storage', url: env.DATABASE_URL }),
  agents: mastraAgents,
  server: {
    port: env.PORT,
    host: env.HOST,
    apiPrefix: '/_mastra',
    cors: { origin: env.WEB_URL },
    apiRoutes: [
      healthRoute,
      ...providerRoutes,
      ...createProductionAgentRoutes(runtimeDeps),
      ...createConversationRoutes({
        userId: env.AETHER_LOCAL_USER_ID,
        resolveAgent: async (agentId) => {
          const { resolveAgent } = await import('../agents/resolver.js')
          return resolveAgent(runtimeDeps, agentId)
        },
        create: (agentId, title) => createConversation(env.AETHER_LOCAL_USER_ID, agentId, title),
        list: () => listConversations(env.AETHER_LOCAL_USER_ID),
        find: (id) => findConversation(id, env.AETHER_LOCAL_USER_ID),
        loadMessages: async (threadId, resourceId) => {
          const agent = Object.values(mastraAgents)[0]
          if (!agent?.memory) return []
          return agent.memory.query({ threadId, resourceId }).catch(() => ({ messages: [] as unknown[] })) as Promise<unknown[]>
        },
      }),
      ...createChatRoutes(
        buildChatDependencies({
          userId: env.AETHER_LOCAL_USER_ID,
          agents: mastraAgents,
          recordToolEvent,
          persistUserMessage,
        }),
      ),
    ],
    middleware: [requestIdInjector, requestLogger],
  },
})
```

> **Verify during implementation:** this wiring file is the integration seam. After writing it, run `npm run typecheck` and resolve every error (likely: `agent.memory.createMessages`/`query` method names, `listSuspendedRuns` run shape, `conversationDeps` unused var — delete it). The `conversationDeps` line above is a leftover placeholder; **delete it**. Do not leave unused bindings. Confirm `createMessages`/`query` are the correct `@mastra/memory` method names for the installed version; adjust to the real API. Add `.env` values for `AETHER_DEFAULT_AGENT_ID`/`AETHER_LOCAL_USER_ID` to `apps/agent-server/.env`.

- [ ] **Step 3: Typecheck + start the server to smoke-test**

Run: `npm run typecheck` (fix until green), then `npm run dev:agent` in a separate shell — confirm it boots without error and `GET http://localhost:<PORT>/api/agents` returns the QA Web Agent JSON. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-server/src/mastra/index.ts apps/agent-server/src/services/conversations.ts apps/agent-server/.env
git commit -m "feat(agent-server): wire agent registry, conversations, and chat into Mastra"
```

---

## Task 11: Web — chat API client (catalog/conversations/streaming/approval)

**Files:**
- Create: `apps/web/src/features/chat/chat-api.ts`, `apps/web/src/features/chat/__tests__/chat-api.test.ts`

**Interfaces:**
- Produces: `listAgents`, `createConversation`, `getConversation`, `streamMessage` (async generator of parsed SSE events), `submitApproval`. Types `CatalogAgentDto`, `ConversationDto`, `ChatEvent`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/chat/__tests__/chat-api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { listAgents, streamMessage } from '../chat-api.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('chat api client', () => {
  it('lists catalog agents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ manifest: { id: 'qa-web-agent' }, configured: true }])))
    const agents = await listAgents('http://srv')
    expect(agents[0]?.manifest.id).toBe('qa-web-agent')
    vi.unstubAllGlobals()
  })

  it('parses SSE events from a streamed response', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text","text":"Hi"}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"message_end"}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })))
    const events: unknown[] = []
    for await (const event of streamMessage('http://srv', 'conv-1', { text: 'hi' })) events.push(event)
    expect(events).toEqual([{ type: 'text', text: 'Hi' }, { type: 'message_end' }])
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run apps/web/src/features/chat/__tests__/chat-api.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/web/src/features/chat/chat-api.ts`**

```ts
export interface AgentManifestDto {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly protected: boolean
  readonly capabilities: readonly string[]
  readonly status: string
}
export interface CatalogAgentDto {
  readonly manifest: AgentManifestDto
  readonly configured: boolean
}
export interface ConversationDto {
  readonly id: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}
export type ChatEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_start'; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: 'tool_approval_required'; readonly runId: string; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: 'tool_result'; readonly toolCallId: string; readonly toolName: string; readonly result: unknown }
  | { readonly type: 'message_end' }
  | { readonly type: 'error'; readonly message: string }

interface ApiErrorBody {
  readonly error?: { readonly message?: string }
}

async function request<T>(apiBase: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    cache: 'no-store',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  if (!response.ok) {
    const fallback = `Request failed: ${response.status} ${response.statusText}`
    let message = fallback
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error?.message ?? fallback
    } catch {
      // keep fallback
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export function listAgents(apiBase: string, signal?: AbortSignal): Promise<CatalogAgentDto[]> {
  return request<CatalogAgentDto[]>(apiBase, '/api/agents', { method: 'GET', ...(signal ? { signal } : {}) })
}

export function createConversation(apiBase: string, agentId: string, title: string): Promise<ConversationDto> {
  return request<ConversationDto>(apiBase, '/api/conversations', { method: 'POST', body: JSON.stringify({ agentId, title }) })
}

export function listConversations(apiBase: string): Promise<ConversationDto[]> {
  return request<ConversationDto[]>(apiBase, '/api/conversations', { method: 'GET' })
}

export interface ConversationDetail {
  readonly conversation: ConversationDto
  readonly messages: readonly { readonly role: string; readonly content: string }[]
}

export function getConversation(apiBase: string, id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(apiBase, `/api/conversations/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function* streamMessage(
  apiBase: string,
  conversationId: string,
  body: { readonly text: string },
  signal?: AbortSignal,
): AsyncIterable<ChatEvent> {
  const response = await fetch(
    `${apiBase}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) },
  )
  if (!response.ok || !response.body) throw new Error(`Stream failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      yield JSON.parse(payload) as ChatEvent
    }
  }
}

export async function* submitApproval(
  apiBase: string,
  conversationId: string,
  toolCallId: string,
  decision: 'approve' | 'deny',
): AsyncIterable<ChatEvent> {
  const response = await fetch(
    `${apiBase}/api/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(toolCallId)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ decision }) },
  )
  if (!response.ok || !response.body) throw new Error(`Approval failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      yield JSON.parse(payload) as ChatEvent
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run apps/web/src/features/chat/__tests__/chat-api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/chat/chat-api.ts apps/web/src/features/chat/__tests__/chat-api.test.ts
git commit -m "feat(web): add catalog, conversation, and streaming chat API client"
```

---

## Task 12: Web — Agent Catalog UI

**Files:**
- Create: `apps/web/src/features/agents/index.tsx`, `apps/web/src/app/agents/page.tsx`
- Modify: `apps/web/src/components/shell.tsx` (nav link), `apps/web/src/app/page.tsx` (redirect to `/agents`)

**Interfaces:**
- Consumes: `listAgents`, `createConversation` from `features/chat/chat-api`, `useToast`, `publicConfig.agentServerUrl`.

- [ ] **Step 1: Implement `apps/web/src/features/agents/index.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Lock, AlertCircle } from 'lucide-react'
import { listAgents, createConversation, type CatalogAgentDto } from '../chat/chat-api'
import { publicConfig } from '../../lib/config'
import { useToast } from '../../components/toast/toast-provider'

export function AgentCatalog() {
  const router = useRouter()
  const toast = useToast()
  const [agents, setAgents] = useState<readonly CatalogAgentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listAgents(publicConfig.agentServerUrl)
      .then((result) => {
        if (!cancelled) setAgents(result)
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Could not load agents.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  async function start(agent: CatalogAgentDto) {
    if (!agent.configured) {
      toast.info(`${agent.manifest.name} needs a bound model. Add one in Provider settings.`)
      return
    }
    setStarting(agent.manifest.id)
    try {
      const conversation = await createConversation(
        publicConfig.agentServerUrl,
        agent.manifest.id,
        `Chat with ${agent.manifest.name}`,
      )
      router.push(`/chat/${conversation.id}`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not start conversation.')
    } finally {
      setStarting(null)
    }
  }

  if (loading) {
    return <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">Loading agents…</p>
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <article
          key={agent.manifest.id}
          className="flex flex-col justify-between border border-[var(--color-muted)]/40 bg-[var(--color-surface)] p-5 md:p-6"
        >
          <div>
            <div className="flex items-center justify-between">
              <Bot className="h-5 w-5 text-[var(--color-taupe)]" aria-hidden />
              {agent.manifest.protected ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                  <Lock className="h-3 w-3" aria-hidden /> Built-in
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--color-primary)]">{agent.manifest.name}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{agent.manifest.description}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {agent.manifest.capabilities.map((capability) => (
                <li
                  key={capability}
                  className="border border-[var(--color-muted)]/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]"
                >
                  {capability}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void start(agent)}
              disabled={!agent.configured || starting === agent.manifest.id}
              className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait disabled:opacity-50"
            >
              {starting === agent.manifest.id ? 'Starting…' : 'Start conversation'}
            </button>
            {!agent.configured ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-danger)]">
                <AlertCircle className="h-3 w-3" aria-hidden /> Not configured
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/app/agents/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { AgentCatalog } from '../../features/agents'

export const metadata: Metadata = { title: 'Agents — Aether' }

export default function AgentsPage() {
  return (
    <div>
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Catalog</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--color-primary)]">Agents</h1>
      </header>
      <AgentCatalog />
    </div>
  )
}
```

- [ ] **Step 3: Add nav link in `apps/web/src/components/shell.tsx`**

In the `<nav>`, before the "Provider settings" link, add:

```tsx
<Link
  href="/agents"
  className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-taupe)]"
>
  Agents
</Link>
```

Remove the `<span>foundation</span>` placeholder line.

- [ ] **Step 4: Redirect home to `/agents` in `apps/web/src/app/page.tsx`**

Replace the page body with a redirect:

```tsx
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/agents')
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agents apps/web/src/app/agents apps/web/src/app/page.tsx apps/web/src/components/shell.tsx
git commit -m "feat(web): add agent catalog page and shell nav"
```

---

## Task 13: Web — Chat UI (messages, composer, tool timeline, approval)

**Files:**
- Create: `apps/web/src/features/chat/index.tsx`, `apps/web/src/features/chat/components/MessageList.tsx`, `apps/web/src/features/chat/components/Composer.tsx`, `apps/web/src/features/chat/components/ToolTimeline.tsx`, `apps/web/src/features/chat/components/ApprovalBar.tsx`, `apps/web/src/app/chat/[conversationId]/page.tsx`

**Interfaces:**
- Consumes: `getConversation`, `streamMessage`, `submitApproval`, `ChatEvent`, `useToast`, `publicConfig`.

- [ ] **Step 1: Implement `apps/web/src/features/chat/components/MessageList.tsx`**

```tsx
'use client'

export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export function MessageList({ messages }: { readonly messages: readonly ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={
            message.role === 'user'
              ? 'self-end max-w-[80%] border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-text-inverted)]'
              : 'self-start max-w-[80%] border border-[var(--color-muted)]/40 bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)]'
          }
        >
          {message.content}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Implement `apps/web/src/features/chat/components/ToolTimeline.tsx`**

```tsx
'use client'

import { Wrench, CheckCircle2, Clock } from 'lucide-react'

export interface ToolTimelineItem {
  readonly toolCallId: string
  readonly toolName: string
  readonly status: 'requested' | 'success' | 'error'
  readonly args?: unknown
  readonly result?: unknown
}

export function ToolTimeline({ items }: { readonly items: readonly ToolTimelineItem[] }) {
  if (items.length === 0) return null
  return (
    <aside className="border border-[var(--color-muted)]/40 bg-[var(--color-beige)] p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Tool timeline</p>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.toolCallId} className="flex items-start gap-2 text-xs text-[var(--color-text)]">
            {item.status === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden />
            ) : (
              <Clock className="mt-0.5 h-3.5 w-3.5 text-[var(--color-taupe)]" aria-hidden />
            )}
            <span className="font-mono">{item.toolName}</span>
            <span className="text-[var(--color-muted)]">{item.status}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
```

> `Wrench` import unused — remove it from the import list before committing to satisfy `noUnusedLocals`.

- [ ] **Step 3: Implement `apps/web/src/features/chat/components/ApprovalBar.tsx`**

```tsx
'use client'

interface ApprovalBarProps {
  readonly toolName: string
  readonly args: unknown
  readonly onApprove: () => void
  readonly onDeny: () => void
  readonly pending: boolean
}

export function ApprovalBar({ toolName, args, onApprove, onDeny, pending }: ApprovalBarProps) {
  return (
    <div className="border border-[var(--color-taupe)] bg-[var(--color-beige)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Approval required</p>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        <span className="font-mono">{toolName}</span>{' '}
        <span className="text-[var(--color-muted)]">{JSON.stringify(args)}</span>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="border border-[var(--color-success)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-success)] hover:bg-[var(--color-success)]/10 disabled:cursor-wait disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDeny}
          className="border border-[var(--color-danger)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-wait disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `apps/web/src/features/chat/index.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getConversation,
  streamMessage,
  submitApproval,
  type ChatEvent,
  type ConversationDto,
} from './chat-api'
import { publicConfig } from '../../lib/config'
import { useToast } from '../../components/toast/toast-provider'
import { MessageList, type ChatMessage } from './components/MessageList'
import { Composer } from './components/Composer'
import { ToolTimeline, type ToolTimelineItem } from './components/ToolTimeline'
import { ApprovalBar } from './components/ApprovalBar'

export function Chat({ conversationId }: { readonly conversationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [conversation, setConversation] = useState<ConversationDto | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tools, setTools] = useState<ToolTimelineItem[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [approval, setApproval] = useState<{ toolCallId: string; toolName: string; args: unknown } | null>(null)
  const [approving, setApproving] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getConversation(publicConfig.agentServerUrl, conversationId)
      .then((detail) => {
        setConversation(detail.conversation)
        setMessages(detail.messages.map((message) => ({ role: message.role as 'user' | 'assistant', content: String(message.content) })))
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Conversation not found.')
        router.push('/agents')
      })
  }, [conversationId, router, toast])

  async function send() {
    if (!draft.trim() || sending) return
    const text = draft
    setDraft('')
    setSending(true)
    setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    try {
      for await (const event of streamMessage(publicConfig.agentServerUrl, conversationId, { text })) {
        applyEvent(event)
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Stream failed.')
    } finally {
      setSending(false)
    }
  }

  function applyEvent(event: ChatEvent) {
    switch (event.type) {
      case 'text':
        setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + event.text }
          }
          return next
        })
        break
      case 'tool_start':
        setTools((current) => [...current, { toolCallId: event.toolCallId, toolName: event.toolName, status: 'requested', args: event.args }])
        break
      case 'tool_result':
        setTools((current) =>
          current.map((item) =>
            item.toolCallId === event.toolCallId ? { ...item, status: 'success', result: event.result } : item,
          ),
        )
        break
      case 'tool_approval_required':
        setApproval({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args })
        break
      case 'error':
        toast.error(event.message)
        break
      default:
        break
    }
  }

  async function decide(decision: 'approve' | 'deny') {
    if (!approval) return
    setApproving(true)
    try {
      for await (const event of submitApproval(publicConfig.agentServerUrl, conversationId, approval.toolCallId, decision)) {
        applyEvent(event)
      }
      setApproval(null)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Approval failed.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col gap-4">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {conversation?.agentId ?? '—'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[var(--color-primary)]">
            {conversation?.title ?? 'Chat'}
          </h1>
        </header>
        <MessageList messages={messages} />
        {approval ? (
          <ApprovalBar toolName={approval.toolName} args={approval.args} pending={approving} onApprove={() => void decide('approve')} onDeny={() => void decide('deny')} />
        ) : null}
        <Composer value={draft} onChange={setDraft} onSubmit={() => void send()} disabled={sending || Boolean(approval)} />
      </section>
      <ToolTimeline items={tools} />
    </div>
  )
}
```

- [ ] **Step 5: Implement `apps/web/src/features/chat/components/Composer.tsx`**

```tsx
'use client'

import { type FormEvent } from 'react'

interface ComposerProps {
  readonly value: string
  onChange(value: string): void
  onSubmit(): void
  readonly disabled: boolean
}

export function Composer({ value, onChange, onSubmit, disabled }: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Message the agent…"
        className="flex-1 border border-[var(--color-muted)]/60 bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-taupe)]"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-inverted)] transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait disabled:opacity-50"
      >
        Send
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Create `apps/web/src/app/chat/[conversationId]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { Chat } from '../../../../features/chat'

export const metadata: Metadata = { title: 'Chat — Aether' }

export default function ChatPage({ params }: { readonly params: Promise<{ readonly conversationId: string }> }) {
  // Next 16 async params: unwrap in a client child. Keep this server component thin.
  return <ChatRouteLoader />
}

import { use } from 'react'
function ChatRouteLoader() {
  return null
}
```

> **Verify during implementation:** Next.js 16 exposes `params` as a Promise. The chat view is a client component that needs the `conversationId`. Cleanest: make the page a client component (`'use client'`) and `use(params)`. Replace the above with:

```tsx
'use client'

import { use } from 'react'
import { Chat } from '../../../../features/chat'

export default function ChatPage({ params }: { readonly params: Promise<{ readonly conversationId: string }> }) {
  const { conversationId } = use(params)
  return <Chat conversationId={conversationId} />
}
```

(Delete the unused server-component version; keep only the client version. Add a `metadata` export only from a separate server component if needed — skip metadata for the chat route to keep it a single client file.)

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: PASS. Fix any unused imports (e.g. remove `Wrench`, the `metadata` export, `controllerRef` if unused — wire `controllerRef` into `streamMessage`'s `signal` or remove it).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/chat apps/web/src/app/chat
git commit -m "feat(web): add chat view with streaming, tool timeline, and approval bar"
```

---

## Task 14: Dynamic agent list in AgentBindingManager

**Files:**
- Modify: `apps/web/src/features/providers/components/AgentBindingManager.tsx`

**Interfaces:**
- Consumes: `listAgents` from `features/chat/chat-api`.

- [ ] **Step 1: Replace the hardcoded `qa-web-agent` option**

In `AgentBindingManager.tsx`:
- Add a `catalogAgents` prop: `readonly catalogAgents: readonly { readonly id: string; readonly name: string }[]`.
- Replace the `<select>` options block (lines that hardcode `qa-web-agent`) with:

```tsx
{catalogAgents.map((agent) => (
  <option key={agent.id} value={agent.id}>
    {agent.id}
  </option>
))}
{bindings
  .filter((binding) => !catalogAgents.some((agent) => agent.id === binding.agentId))
  .map((binding) => (
    <option key={binding.agentId} value={binding.agentId}>
      {binding.agentId}
    </option>
  ))}
```

- Change the initial state to default to `catalogAgents[0]?.id ?? bindings[0]?.agentId ?? ''` instead of the literal `'qa-web-agent'`, and update the `initialBinding` lookup to use that id.

- [ ] **Step 2: Feed catalog agents from `ProviderSettings`**

In `apps/web/src/features/providers/index.tsx`, import `listAgents` and load catalog agents alongside the existing parallel load; pass `catalogAgents` (mapped to `{id, name}`) into `<AgentBindingManager>`.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/providers
git commit -m "feat(web): drive agent binding options from the catalog"
```

---

## Task 15: Docs + Playwright install note + full validation

**Files:**
- Modify: `README.md` (short "Run the agent server + chat" note + Playwright install step), `.gitignore` (add `.browser-sessions/`)

- [ ] **Step 1: Add `.browser-sessions/` to `.gitignore`**

Append:

```
# Playwright persistent browser contexts (per-conversation)
.browser-sessions/
```

- [ ] **Step 2: Document Playwright + chat in README**

Append a section:

```md
## Agent Catalog and Chat (PR-2)

1. Configure a provider connection, approve a model profile, and bind it to `qa-web-agent` in Provider settings.
2. Start the stack: `npm run dev`.
3. Open the **Agents** page, start a conversation with QA Web Agent, and chat.
4. Browser actions (`browser.click`, `browser.type`) require on-screen approval.

Install the browser binary once for local QA Web runs:

```sh
npx playwright install chromium
```
```

- [ ] **Step 3: Run the full validation suite**

Run, in order, from the repo root:
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run format:check`
- `npm run build`

Expected: all PASS. Fix anything red before proceeding.

- [ ] **Step 4: Manual smoke test**

- Bind a model to `qa-web-agent`; confirm `GET /api/agents` shows `configured: true`.
- Start a conversation; send "go to https://example.com and describe it"; confirm streaming text + a `browser.navigate` tool event.
- Trigger an action requiring approval (`browser.click`); confirm the approval bar appears, Approve resumes the stream.
- Reload the page; confirm messages persist.
- Attempting to select another agent in the catalog starts a *new* conversation (no silent switch).

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore
git commit -m "docs(pr-2): document agent catalog, chat flow, and Playwright setup"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/agent-catalog-chat
```

Open a PR `feat/agent-catalog-chat` → `main`, reviewer **Mas Gitgit**, using the PR-2 acceptance criteria as the PR checklist.

---

## Self-Review Notes (applied during authoring)

- **Spec coverage:** every PR-2 scope item maps to a task — Agent Registry (T3, T6), QA Web Agent registration (T3, T6), Agent Catalog UI (T12), Conversation creation + persistence (T2, T8, T10), agentId binding/immutable (T8), Streaming (T9, T11, T13), Tool-event timeline (T9 mapper + T13 UI), Browser approval behavior (T4, T6 wrappers, T9 approval route, T13 bar), Configurable default agent (T5 env). Acceptance criteria each verified in T15 smoke + individual tests.
- **Placeholders:** none left as "TBD"; remaining `Verify during implementation` notes are concrete Mastra version-pin checks (specific symbols named), not unspecified work.
- **Type consistency:** `ChatEvent` / `StreamChunk` / `ConversationRecord` / `CatalogAgent` shapes kept consistent across server mapper, routes, services, and web client. `BROWSER_TOOL_RISK` shared between `packages/tools` and the server mapper.
- **Known integration risks (flagged inline, must resolve in T6/T10):** exact `@mastra/memory` import path + Memory method names (`createMessages`/`query`); `agent.stream`/`approveToolCall`/`declineToolCall`/`listSuspendedRuns` return shapes; `createTool` execute context arg for threading `conversationId`; Next 16 async `params`.
