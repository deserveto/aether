# Agent Builder (PR-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the database-backed Agent Builder control plane enabling CRUD, draft/publish lifecycles, model and tool selections, memory settings, and draft testing for custom agents.

**Architecture:** Database-backed stored agents using a composite primary key `(id, status)` in the `stored_agents` table. Conversations route dynamically to either `'published'` or `'draft'` versions via an `agentVersion` field. Resolver merges built-in and stored published agents, checking profile configuration dynamically. Next.js dashboard and form elements manage custom agent creation and editing.

**Tech Stack:** TypeScript (strict), npm workspaces, Mastra 1.50, Drizzle + LibSQL, Vitest, Next.js 16, React 19, Lucide React, Tailwind v4.

## Global Constraints

- Agent IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; reserved `qa-web-agent`, `qa-mobile-agent`; no generic `main-agent` (ADR-005).
- Stored agents cannot reuse reserved IDs. Built-in agents are protected from archival or deletion.
- Secrets never reach the browser (ADR-009) — web works with provider and profile IDs only.
- Validation commands run from workspace root: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, `npm run build`.

---

## File Structure

**Modified database package (`packages/database`):**
- Modify: `packages/database/src/schema.ts` — add `storedAgents` table, add `agentVersion` to `conversations`.
- Modify: `packages/database/src/index.ts` — update `initDb()` with stored agents table and conversations migration block.
- Create: `packages/database/src/__tests__/stored-agents.test.ts` — test stored agents schema and cascading behavior.

**Modified agent server (`apps/agent-server`):**
- Modify: `apps/agent-server/src/agents/resolver.ts` — support stored agents, catalog merging, and `agentVersion` parsing.
- Modify: `apps/agent-server/src/agents/build.ts` — support compile-on-demand dynamic agents.
- Create: `apps/agent-server/src/mastra/routes/builder.ts` — Hono route definition for CRUD and publish/archive/delete workflows.
- Modify: `apps/agent-server/src/mastra/routes/conversations.ts` — support `agentVersion` input payload.
- Modify: `apps/agent-server/src/mastra/routes/chat.ts` — resolve conversation version inside streams.
- Modify: `apps/agent-server/src/mastra/index.ts` — register builder routes and adapt `getConfiguredMastraAgent`.
- Modify: `apps/agent-server/src/services/conversations.ts` — support `agentVersion` during creation, query by threadId.

**Modified web client (`apps/web`):**
- Create: `apps/web/src/features/builder/builder-api.ts` — client API gateway for builder requests.
- Create: `apps/web/src/features/builder/index.tsx` — builder dashboard listing agents.
- Create: `apps/web/src/features/builder/components/AgentForm.tsx` — shared creation/editing form.
- Create: `apps/web/src/app/builder/page.tsx` — dashboard mount page.
- Create: `apps/web/src/app/builder/new/page.tsx` — creation route.
- Create: `apps/web/src/app/builder/[id]/edit/page.tsx` — editing route.
- Modify: `apps/web/src/components/shell.tsx` — add Sidebar link to "/builder".
- Modify: `apps/web/src/features/providers/components/AgentBindingManager.tsx` — bind dynamic list.

---

## Tasks

### Task 1: Database Schema & Migration

**Files:**
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/index.ts`
- Create: `packages/database/src/__tests__/stored-agents.test.ts`

**Interfaces:**
- Produces: Drizzle export `storedAgents` table and updated `conversations` schema.

- [ ] **Step 1: Update Drizzle Schema**

  Add `storedAgents` and modify `conversations` in `packages/database/src/schema.ts`. Place them after the `toolEvents` schema:

  ```typescript
  import { primaryKey } from 'drizzle-orm/sqlite-core'

  export const storedAgents = sqliteTable('stored_agents', {
    id: text('id').notNull(),
    status: text('status')
      .$type<'draft' | 'published' | 'archived'>()
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    instructions: text('instructions').notNull(),
    category: text('category')
      .$type<'qa' | 'research' | 'productivity' | 'social' | 'custom'>()
      .notNull(),
    capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull(),
    toolIds: text('tool_ids', { mode: 'json' }).$type<string[]>().notNull(),
    primaryModelProfileId: text('primary_model_profile_id')
      .references(() => modelProfiles.id, { onDelete: 'restrict' }),
    fallbackModelProfileIds: text('fallback_model_profile_ids', { mode: 'json' })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    memoryEnabled: integer('memory_enabled', { mode: 'boolean' }).default(true).notNull(),
    memoryMode: text('memory_mode')
      .$type<'thread' | 'resource-and-thread'>()
      .default('thread')
      .notNull(),
    visibility: text('visibility')
      .$type<'private' | 'internal' | 'public'>()
      .default('public')
      .notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }, (table) => [
    {
      pk: primaryKey({ columns: [table.id, table.status] }),
    }
  ])

  export const conversations = sqliteTable('conversations', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    agentId: text('agent_id').notNull(),
    agentVersion: text('agent_version')
      .$type<'published' | 'draft'>()
      .default('published')
      .notNull(),
    threadId: text('thread_id').notNull().unique(),
    title: text('title').notNull(),
    status: text('status').$type<'active' | 'archived'>().default('active').notNull(),
    createdAt: text('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  })
  ```

- [ ] **Step 2: Update Database Setup**

  Modify `initDb` in `packages/database/src/index.ts`. Add stored agents setup and alter table logic:

  ```typescript
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stored_agents (
      id TEXT NOT NULL,
      status TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      instructions TEXT NOT NULL,
      category TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      tool_ids TEXT NOT NULL,
      primary_model_profile_id TEXT,
      fallback_model_profile_ids TEXT DEFAULT '[]' NOT NULL,
      memory_enabled INTEGER DEFAULT 1 NOT NULL,
      memory_mode TEXT DEFAULT 'thread' NOT NULL,
      visibility TEXT DEFAULT 'public' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY (id, status),
      FOREIGN KEY (primary_model_profile_id) REFERENCES model_profiles(id) ON DELETE RESTRICT
    );
  `)

  try {
    await client.execute(`ALTER TABLE conversations ADD COLUMN agent_version TEXT DEFAULT 'published' NOT NULL;`)
  } catch {
    // Column already exists
  }
  ```

- [ ] **Step 3: Write Schema Tests**

  Create `packages/database/src/__tests__/stored-agents.test.ts`:

  ```typescript
  import { afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { client, db, initDb, storedAgents, conversations } from '../index.js'

  describe('stored agents schema', () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = 'file::memory:'
      await initDb()
    })

    afterEach(async () => {
      await client.execute({ sql: 'DELETE FROM stored_agents', args: [] })
      await client.execute({ sql: 'DELETE FROM conversations', args: [] })
    })

    it('creates stored agent draft and published rows', async () => {
      const now = new Date().toISOString()
      const [draft] = await db.insert(storedAgents).values({
        id: 'agent-1',
        status: 'draft',
        name: 'Agent 1 Draft',
        description: 'Test',
        instructions: 'Do things',
        category: 'custom',
        capabilities: JSON.stringify(['cap-1']),
        toolIds: JSON.stringify(['tool-1']),
        fallbackModelProfileIds: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      }).returning()

      const [published] = await db.insert(storedAgents).values({
        id: 'agent-1',
        status: 'published',
        name: 'Agent 1 Published',
        description: 'Test',
        instructions: 'Do things',
        category: 'custom',
        capabilities: JSON.stringify(['cap-1']),
        toolIds: JSON.stringify(['tool-1']),
        fallbackModelProfileIds: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      }).returning()

      expect(draft?.name).toBe('Agent 1 Draft')
      expect(published?.name).toBe('Agent 1 Published')
    })
  })
  ```

- [ ] **Step 4: Run Tests**

  Run: `npm run test` from repo root.
  Expected: All tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/database/src/schema.ts packages/database/src/index.ts packages/database/src/__tests__/stored-agents.test.ts
  git commit -m "feat(database): add stored_agents schema and alter conversations"
  ```

---

### Task 2: Agent Runtime, Resolver & Dynamic Compilation

**Files:**
- Modify: `apps/agent-server/src/agents/resolver.ts`
- Modify: `apps/agent-server/src/agents/build.ts`
- Create: `apps/agent-server/src/__tests__/resolver.test.ts` (extend existing or overwrite)

**Interfaces:**
- Consumes: `storedAgents` table entries.
- Produces: dynamic compilation helpers `buildDynamicAgent()` and merged resolver functions.

- [ ] **Step 1: Update AgentResolver types**

  In `apps/agent-server/src/agents/resolver.ts`, import `AgentManifest` from `@aether/shared`, update `AgentRuntimeDeps` and exports:

  ```typescript
  import type { CatalogAgent, AgentManifest, AgentCategory, AgentStatus, AgentSource } from '@aether/shared'
  import type { BuiltInAgentDeclaration } from '@aether/agents'

  export interface StoredAgentRow {
    readonly id: string
    readonly status: 'draft' | 'published' | 'archived'
    readonly name: string
    readonly description: string
    readonly instructions: string
    readonly category: AgentCategory
    readonly capabilities: string[]
    readonly toolIds: string[]
    readonly primaryModelProfileId: string | null
    readonly fallbackModelProfileIds: string[]
    readonly memoryEnabled: boolean
    readonly memoryMode: 'thread' | 'resource-and-thread'
    readonly visibility: 'private' | 'internal' | 'public'
    readonly createdAt: string
    readonly updatedAt: string
  }

  export interface AgentRuntimeDeps {
    listBuiltIn(): readonly BuiltInAgentDeclaration[]
    findBinding(agentId: string): Promise<BindingRow | undefined>
    findProfile(profileId: string): Promise<ProfileRow | undefined>
    findConnection(connectionId: string): Promise<ConnectionRow | undefined>
    listStoredAgents(status?: AgentStatus): Promise<StoredAgentRow[]>
    findStoredAgent(id: string, status: AgentStatus): Promise<StoredAgentRow | undefined>
  }
  ```

- [ ] **Step 2: Update resolveCatalog and resolveAgent in resolver**

  Implement stored agent catalog inclusion:

  ```typescript
  async function isConfigured(deps: AgentRuntimeDeps, primaryModelProfileId: string | null): Promise<boolean> {
    if (!primaryModelProfileId) return false
    const profile = await deps.findProfile(primaryModelProfileId)
    if (!profile || !profile.approved || !profile.enabled) return false
    const connection = await deps.findConnection(profile.providerConnectionId)
    return Boolean(connection && connection.enabled)
  }

  export function mapStoredToManifest(stored: StoredAgentRow): AgentManifest {
    return {
      id: stored.id,
      name: stored.name,
      description: stored.description,
      category: stored.category,
      source: 'stored' as const,
      status: stored.status,
      protected: false,
      capabilities: stored.capabilities,
      toolIds: stored.toolIds,
      modelBinding: stored.primaryModelProfileId ? {
        primaryModelProfileId: stored.primaryModelProfileId,
        fallbackModelProfileIds: stored.fallbackModelProfileIds,
      } : null,
      memory: { enabled: stored.memoryEnabled, mode: stored.memoryMode },
      visibility: stored.visibility,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    }
  }

  export async function resolveCatalog(deps: AgentRuntimeDeps): Promise<CatalogAgent[]> {
    const builtIn = deps.listBuiltIn()
    const stored = await deps.listStoredAgents('published')

    const builtInCatalog = await Promise.all(
      builtIn.map(async (agent) => {
        const binding = await deps.findBinding(agent.manifest.id)
        return {
          manifest: agent.manifest,
          configured: await isConfigured(deps, binding?.primaryModelProfileId ?? null),
        }
      })
    )

    const storedCatalog = await Promise.all(
      stored.map(async (agent) => ({
        manifest: mapStoredToManifest(agent),
        configured: await isConfigured(deps, agent.primaryModelProfileId),
      }))
    )

    return [...builtInCatalog, ...storedCatalog]
  }

  export async function resolveAgent(
    deps: AgentRuntimeDeps,
    id: string,
    version: 'published' | 'draft' = 'published'
  ): Promise<ResolvedAgent | null> {
    if (version === 'published') {
      const builtIn = deps.listBuiltIn().find((item) => item.manifest.id === id)
      if (builtIn) {
        const binding = await deps.findBinding(id)
        return {
          manifest: builtIn.manifest,
          configured: await isConfigured(deps, binding?.primaryModelProfileId ?? null),
        }
      }
      const stored = await deps.findStoredAgent(id, 'published')
      if (!stored) return null
      return {
        manifest: mapStoredToManifest(stored),
        configured: await isConfigured(deps, stored.primaryModelProfileId),
      }
    } else {
      const stored = await deps.findStoredAgent(id, 'draft')
      if (!stored) return null
      return {
        manifest: mapStoredToManifest(stored),
        configured: await isConfigured(deps, stored.primaryModelProfileId),
      }
    }
  }
  ```

- [ ] **Step 3: Support Dynamic Compilation in build.ts**

  Modify `apps/agent-server/src/agents/build.ts` to export `buildDynamicAgent`. Replace `resolveRequiredLanguageModel` logic:

  ```typescript
  import type { AgentManifest } from '@aether/shared'
  import { mapStoredToManifest } from './resolver.js'

  async function resolveRequiredLanguageModel(
    deps: MastraAgentDeps,
    agentId: string,
    manifest: AgentManifest | null = null,
    version: 'published' | 'draft' = 'published'
  ): Promise<ResolvedModel> {
    let primaryModelProfileId: string | null = null
    if (manifest?.modelBinding) {
      primaryModelProfileId = manifest.modelBinding.primaryModelProfileId
    } else {
      const binding = await deps.findBinding(agentId)
      primaryModelProfileId = binding?.primaryModelProfileId ?? null
    }

    if (!primaryModelProfileId) {
      throw new Error(`Agent is not configured with an approved model: ${agentId}`)
    }

    const profile = await deps.findProfile(primaryModelProfileId)
    if (!profile || !profile.approved || !profile.enabled) {
      throw new Error(`Model profile is disabled or unapproved: ${primaryModelProfileId}`)
    }
    const connection = await deps.findConnection(profile.providerConnectionId)
    if (!connection || !connection.enabled) {
      throw new Error(`Provider connection is disabled: ${profile.providerConnectionId}`)
    }
    const apiKey = await deps.resolveSecret(connection.secretRef)
    return getAdapter(connection.type).resolveModel(
      connection.baseUrl ?? undefined,
      apiKey,
      profile as unknown as ModelProfile,
    )
  }

  export async function buildDynamicAgent(
    deps: MastraAgentDeps,
    agentId: string,
    version: 'published' | 'draft' = 'published',
  ): Promise<Agent> {
    const sessionStore = deps.sessionStore ?? new BrowserSessionStore()
    const memory =
      deps.memory ??
      new Memory({
        storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
      })

    let name: string
    let instructions: string
    let manifest: AgentManifest | null = null

    if (version === 'published') {
      const builtIn = deps.listBuiltIn().find((item) => item.manifest.id === agentId)
      if (builtIn) {
        name = builtIn.manifest.name
        instructions = builtIn.instructions
        manifest = builtIn.manifest
      } else {
        const stored = await deps.findStoredAgent(agentId, 'published')
        if (!stored) throw new Error(`Agent not found: ${agentId}`)
        name = stored.name
        instructions = stored.instructions
        manifest = mapStoredToManifest(stored)
      }
    } else {
      const stored = await deps.findStoredAgent(agentId, 'draft')
      if (!stored) throw new Error(`Draft agent not found: ${agentId}`)
      name = stored.name
      instructions = stored.instructions
      manifest = mapStoredToManifest(stored)
    }

    return new Agent({
      id: agentId,
      name,
      instructions,
      model: () => resolveRequiredLanguageModel(deps, agentId, manifest, version),
      tools: buildBrowserTools(sessionStore),
      memory,
    })
  }
  ```

- [ ] **Step 4: Update unit tests for resolver**

  Modify `apps/agent-server/src/__tests__/resolver.test.ts` to mock `listStoredAgents` and `findStoredAgent`. Run verification checks.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/agent-server/src/agents/resolver.ts apps/agent-server/src/agents/build.ts apps/agent-server/src/__tests__/resolver.test.ts
  git commit -m "feat(agent-server): support stored agent resolution and dynamic agent compilation"
  ```

---

### Task 3: Agent Builder API Endpoints (CRUD + Lifecycle)

**Files:**
- Create: `apps/agent-server/src/mastra/routes/builder.ts`
- Modify: `apps/agent-server/src/mastra/index.ts`
- Create: `apps/agent-server/src/__tests__/builder-routes.test.ts`

**Interfaces:**
- Produces: CRUD routing under `/api/builder/agents`.

- [ ] **Step 1: Write Builder Routes**

  Create `apps/agent-server/src/mastra/routes/builder.ts` with hono routes:

  ```typescript
  import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
  import { db, storedAgents } from '@aether/database'
  import { eq, and } from 'drizzle-orm'
  import { AppError, ErrorCode, assertValidAgentId, RESERVED_AGENT_IDS } from '@aether/shared'
  import { z } from 'zod'

  const agentSchema = z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    description: z.string(),
    instructions: z.string(),
    category: z.enum(['qa', 'research', 'productivity', 'social', 'custom']),
    capabilities: z.array(z.string()),
    toolIds: z.array(z.string()),
    primaryModelProfileId: z.string().nullable(),
    fallbackModelProfileIds: z.array(z.string()),
    memoryEnabled: z.boolean(),
    memoryMode: z.enum(['thread', 'resource-and-thread']),
    visibility: z.enum(['private', 'internal', 'public']),
  })

  export function createBuilderRoutes(): ApiRoute[] {
    return [
      registerApiRoute('/api/builder/agents', {
        method: 'GET',
        requiresAuth: false,
        handler: async (c) => {
          const rows = await db.query.storedAgents.findMany()
          return c.json(rows)
        },
      }),

      registerApiRoute('/api/builder/agents', {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
          const body = agentSchema.parse(await c.req.json())
          assertValidAgentId(body.id)

          if (RESERVED_AGENT_IDS.has(body.id)) {
            return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Cannot reuse reserved Agent IDs' } }, 400)
          }

          // Check if agent already exists with published or draft status
          const existing = await db.query.storedAgents.findFirst({
            where: (f, o) => o.eq(f.id, body.id),
          })
          if (existing) {
            return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Agent ID already exists' } }, 409)
          }

          const now = new Date().toISOString()
          const [row] = await db
            .insert(storedAgents)
            .values({
              ...body,
              status: 'draft',
              capabilities: JSON.stringify(body.capabilities),
              toolIds: JSON.stringify(body.toolIds),
              fallbackModelProfileIds: JSON.stringify(body.fallbackModelProfileIds),
              createdAt: now,
              updatedAt: now,
            })
            .returning()

          return c.json(row)
        },
      }),

      registerApiRoute('/api/builder/agents/:id', {
        method: 'PUT',
        requiresAuth: false,
        handler: async (c) => {
          const id = c.req.param('id')
          const body = agentSchema.parse(await c.req.json())

          let draft = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'draft')),
          })

          const now = new Date().toISOString()
          if (!draft) {
            // Edit first time: copy published version to draft row
            const published = await db.query.storedAgents.findFirst({
              where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'published')),
            })
            if (!published) {
              return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
            }
            await db.insert(storedAgents).values({
              ...published,
              status: 'draft',
              updatedAt: now,
            })
          }

          const [updated] = await db
            .update(storedAgents)
            .set({
              name: body.name,
              description: body.description,
              instructions: body.instructions,
              category: body.category,
              capabilities: JSON.stringify(body.capabilities),
              toolIds: JSON.stringify(body.toolIds),
              primaryModelProfileId: body.primaryModelProfileId,
              fallbackModelProfileIds: JSON.stringify(body.fallbackModelProfileIds),
              memoryEnabled: body.memoryEnabled,
              memoryMode: body.memoryMode,
              visibility: body.visibility,
              updatedAt: now,
            })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'draft')))
            .returning()

          return c.json(updated)
        },
      }),

      registerApiRoute('/api/builder/agents/:id/publish', {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
          const id = c.req.param('id')
          const draft = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'draft')),
          })
          if (!draft) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } }, 404)
          }

          if (!draft.primaryModelProfileId) {
            return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Agent requires model profile to publish' } }, 400)
          }

          const now = new Date().toISOString()

          // Delete existing published (if any) and rename draft to published
          await db.delete(storedAgents).where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'published')))
          await db.delete(storedAgents).where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'archived')))

          const [published] = await db
            .update(storedAgents)
            .set({ status: 'published', updatedAt: now })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'draft')))
            .returning()

          return c.json(published)
        },
      }),

      registerApiRoute('/api/builder/agents/:id/archive', {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
          const id = c.req.param('id')
          const published = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'published')),
          })
          if (!published) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Published agent not found' } }, 404)
          }

          const now = new Date().toISOString()
          const [archived] = await db
            .update(storedAgents)
            .set({ status: 'archived', updatedAt: now })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'published')))
            .returning()

          return c.json(archived)
        },
      }),

      registerApiRoute('/api/builder/agents/:id', {
        method: 'DELETE',
        requiresAuth: false,
        handler: async (c) => {
          const id = c.req.param('id')
          if (RESERVED_AGENT_IDS.has(id)) {
            return c.json({ error: { code: ErrorCode.INVALID_INPUT, message: 'Cannot delete built-in agents' } }, 400)
          }

          await db.delete(storedAgents).where(eq(storedAgents.id, id))
          return c.json({ success: true })
        },
      }),
    ]
  }
  ```

- [ ] **Step 2: Wire Builder Routes to Mastra Server**

  In `apps/agent-server/src/mastra/index.ts`, import `createBuilderRoutes` and inject the routes in the `apiRoutes` array. Update `runtimeDeps` to include database resolution logic:

  ```typescript
  import { createBuilderRoutes } from './routes/builder.js'

  // Update runtimeDeps in apps/agent-server/src/mastra/index.ts:
  const runtimeDeps = {
    listBuiltIn,
    findBinding: (agentId: string) =>
      db.query.agentModelBindings.findFirst({ where: (f, o) => o.eq(f.agentId, agentId) }),
    findProfile: (profileId: string) =>
      db.query.modelProfiles.findFirst({ where: (f, o) => o.eq(f.id, profileId) }),
    findConnection: (connectionId: string) =>
      db.query.providerConnections.findFirst({ where: (f, o) => o.eq(f.id, connectionId) }),
    listStoredAgents: async (status) => {
      const rows = await db.query.storedAgents.findMany(
        status ? { where: (f, o) => o.eq(f.status, status) } : undefined
      )
      return rows.map((r) => ({
        ...r,
        capabilities: JSON.parse(r.capabilities) as string[],
        toolIds: JSON.parse(r.toolIds) as string[],
        fallbackModelProfileIds: JSON.parse(r.fallbackModelProfileIds) as string[],
        memoryEnabled: Boolean(r.memoryEnabled),
      }))
    },
    findStoredAgent: async (id, status) => {
      const row = await db.query.storedAgents.findFirst({
        where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, status)),
      })
      if (!row) return undefined
      return {
        ...row,
        capabilities: JSON.parse(row.capabilities) as string[],
        toolIds: JSON.parse(row.toolIds) as string[],
        fallbackModelProfileIds: JSON.parse(row.fallbackModelProfileIds) as string[],
        memoryEnabled: Boolean(row.memoryEnabled),
      }
    },
  }
  ```

- [ ] **Step 3: Write Route Tests**

  Create `apps/agent-server/src/__tests__/builder-routes.test.ts` to test Honó requests.

- [ ] **Step 4: Run Tests**

  Run: `npm run test`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/agent-server/src/mastra/routes/builder.ts apps/agent-server/src/mastra/index.ts
  git commit -m "feat(agent-server): implement builder API endpoints"
  ```

---

### Task 4: Conversation Versioning integration & Chat route adaptation

**Files:**
- Modify: `apps/agent-server/src/mastra/routes/conversations.ts`
- Modify: `apps/agent-server/src/mastra/routes/chat.ts`
- Modify: `apps/agent-server/src/services/conversations.ts`
- Modify: `apps/agent-server/src/mastra/index.ts`

**Interfaces:**
- Consumes: `agent_version` from Hono route controllers.
- Produces: versioned dynamic `Agent` instances mapping conversation streams to drafts.

- [ ] **Step 1: Update Conversations database persistence service**

  Modify `createConversation` in `apps/agent-server/src/services/conversations.ts` to accept `agentVersion`:

  ```typescript
  export async function createConversation(
    userId: string,
    agentId: string,
    title: string,
    agentVersion: 'published' | 'draft' = 'published',
  ): Promise<ConversationRecord> {
    const now = new Date().toISOString()
    const [row] = await db
      .insert(conversations)
      .values({
        id: randomUUID(),
        userId,
        agentId,
        agentVersion,
        threadId: randomUUID(),
        title,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return row as ConversationRecord
  }
  ```

- [ ] **Step 2: Update Conversations routes payload**

  Modify `POST /api/conversations` validation logic in `apps/agent-server/src/mastra/routes/conversations.ts` to parse `agentVersion` from request:

  ```typescript
  const schema = z.object({
    agentId: z.string(),
    title: z.string().min(1),
    agentVersion: z.enum(['published', 'draft']).optional().default('published'),
  })
  ```

  And pass it down to `deps.create(body.agentId, body.title, body.agentVersion)`.

- [ ] **Step 3: Update Chat dependencies dynamically resolve compiled agents**

  In `apps/agent-server/src/mastra/index.ts`, modify `getConfiguredMastraAgent` to compile dynamically using the DB state:

  ```typescript
  async function getConfiguredMastraAgent(agentId: string, conversationId?: string) {
    let version: 'published' | 'draft' = 'published'
    if (conversationId) {
      const conv = await db.query.conversations.findFirst({
        where: (f, o) => o.eq(f.id, conversationId),
      })
      if (conv) {
        version = conv.agentVersion
      }
    } else {
      try {
        const currentConvId = getCurrentConversationId()
        const conv = await db.query.conversations.findFirst({
          where: (f, o) => o.eq(f.id, currentConvId),
        })
        if (conv) {
          version = conv.agentVersion
        }
      } catch {
        // Not in conversation context
      }
    }

    const resolved = await resolveAgent(runtimeDeps, agentId, version)
    if (!resolved?.configured) {
      throw new AppError({
        code: ErrorCode.NOT_CONFIGURED,
        message: 'Agent is not configured with an approved model',
      })
    }

    return buildDynamicAgent(mastraAgentDeps, agentId, version)
  }
  ```

- [ ] **Step 4: Propagate conversation ID context inside chat service**

  Update `buildChatDependencies` in `apps/agent-server/src/services/conversations.ts` to resolve agents contextually using `conversationId`:

  ```typescript
  export function buildChatDependencies(opts: {
    userId: string
    getAgent(agentId: string, conversationId?: string): Promise<Agent>
    recordToolEvent: ChatRouteDependencies['recordToolEvent']
    persistUserMessage: ChatRouteDependencies['persistUserMessage']
  }): ChatRouteDependencies {
    return {
      userId: opts.userId,
      findConversation: (id) => findConversation(id, opts.userId),
      persistUserMessage: opts.persistUserMessage,
      recordToolEvent: opts.recordToolEvent,
      startStream: async ({ conversationId, agentId, threadId, resourceId, text }) => {
        const agent = await opts.getAgent(agentId, conversationId)
        const stream = await agent.stream(text, {
          memory: { thread: threadId, resource: resourceId },
          requireToolApproval: false,
        })
        return { runId: stream.runId, fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
      },
      listSuspendedRuns: async (agentId, threadId, resourceId) => {
        const conv = await db.query.conversations.findFirst({
          where: (f, o) => o.eq(f.threadId, threadId),
        })
        const agent = await opts.getAgent(agentId, conv?.id)
        const { runs } = await agent.listSuspendedRuns({ threadId, resourceId })
        return {
          runs: runs.flatMap((run) =>
            (run.toolCalls ?? [])
              .filter((tc) => !!tc.toolCallId)
              .map((tc) => ({ runId: run.runId, toolCallId: tc.toolCallId as string })),
          ),
        }
      },
      approve: async (agentId, runId, toolCallId): Promise<ContinuationStream> => {
        const agent = await opts.getAgent(agentId)
        const stream = await agent.approveToolCall({ runId, toolCallId })
        return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
      },
      decline: async (agentId, runId, toolCallId): Promise<ContinuationStream> => {
        const agent = await opts.getAgent(agentId)
        const stream = await agent.declineToolCall({ runId, toolCallId })
        return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
      },
    }
  }
  ```

- [ ] **Step 5: Run Tests**

  Verify that basic conversation flows and SSE responses remain functional.
  Run: `npm run test`
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/agent-server/src/mastra/routes/conversations.ts apps/agent-server/src/mastra/routes/chat.ts apps/agent-server/src/services/conversations.ts apps/agent-server/src/mastra/index.ts
  git commit -m "feat(chat): support versioned conversations and draft test routing"
  ```

---

### Task 5: Web UI Agent Builder Dashboard & Forms

**Files:**
- Create: `apps/web/src/features/builder/builder-api.ts`
- Create: `apps/web/src/features/builder/index.tsx`
- Create: `apps/web/src/features/builder/components/AgentForm.tsx`
- Create: `apps/web/src/app/builder/page.tsx`
- Create: `apps/web/src/app/builder/new/page.tsx`
- Create: `apps/web/src/app/builder/[id]/edit/page.tsx`
- Modify: `apps/web/src/components/shell.tsx`

**Interfaces:**
- Produces: Complete Next.js dashboard view and CRUD pages.

- [ ] **Step 1: Write Builder API client adapter**

  Create `apps/web/src/features/builder/builder-api.ts` wrapping fetch adapters matching Swiss UI style:

  ```typescript
  import { publicConfig } from '../../lib/config'

  export interface StoredAgent {
    readonly id: string
    readonly status: 'draft' | 'published' | 'archived'
    readonly name: string
    readonly description: string
    readonly instructions: string
    readonly category: string
    readonly capabilities: readonly string[]
    readonly toolIds: readonly string[]
    readonly primaryModelProfileId: string | null
    readonly fallbackModelProfileIds: readonly string[]
    readonly memoryEnabled: boolean
    readonly memoryMode: 'thread' | 'resource-and-thread'
    readonly visibility: 'private' | 'internal' | 'public'
    readonly createdAt: string
    readonly updatedAt: string
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${publicConfig.agentServerUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`API failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }

  export function listStoredAgents(): Promise<StoredAgent[]> {
    return request<StoredAgent[]>('/api/builder/agents', { method: 'GET' })
  }

  export function createStoredAgent(body: Partial<StoredAgent>): Promise<StoredAgent> {
    return request<StoredAgent>('/api/builder/agents', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  export function updateStoredAgent(id: string, body: Partial<StoredAgent>): Promise<StoredAgent> {
    return request<StoredAgent>(`/api/builder/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  export function publishStoredAgent(id: string): Promise<StoredAgent> {
    return request<StoredAgent>(`/api/builder/agents/${id}/publish`, { method: 'POST' })
  }

  export function archiveStoredAgent(id: string): Promise<StoredAgent> {
    return request<StoredAgent>(`/api/builder/agents/${id}/archive`, { method: 'POST' })
  }

  export function deleteStoredAgent(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/builder/agents/${id}`, { method: 'DELETE' })
  }
  ```

- [ ] **Step 2: Create Agent Form Component**

  Create `apps/web/src/features/builder/components/AgentForm.tsx` to handle create and update details. Ensure model and tool checkboxes match workspace state.

- [ ] **Step 3: Create Builder Dashboard Component**

  Create `apps/web/src/features/builder/index.tsx` for listing custom agents, linking edit/test draft triggers.

- [ ] **Step 4: Mount Next.js Page routes**

  Mount the pages:
  - `apps/web/src/app/builder/page.tsx`
  - `apps/web/src/app/builder/new/page.tsx`
  - `apps/web/src/app/builder/[id]/edit/page.tsx`

- [ ] **Step 5: Modify Navigation layout**

  In `apps/web/src/components/shell.tsx`, add the nav link to `Builder`:
  ```tsx
  <Link href="/builder">Builder</Link>
  ```

- [ ] **Step 6: Build Verification**

  Verify that compilation succeeds.
  Run: `npm run build`
  Expected: Next.js and agent-server compile successfully.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/src/features/builder/ apps/web/src/app/builder/ apps/web/src/components/shell.tsx
  git commit -m "feat(web): build dashboard and customization editor ui"
  ```
