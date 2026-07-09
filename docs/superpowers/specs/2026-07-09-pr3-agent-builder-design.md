# PR-3 Design: Agent Builder

- **Status:** Approved
- **Branch:** `feat/agent-builder`
- **Date:** 2026-07-09
- **Reviewer:** Mas Gitgit
- **Depends on:** PR-2 (Agent Catalog and Chat) — merged

## 1. Goal

Implement the Agent Builder control plane. Users should be able to create, edit, test, publish, archive, and delete database-backed custom agents. Custom published agents must appear in the Agent Catalog and be fully functional in the chat. Built-in agents must remain protected and not deletable.

Acceptance Criteria:
- User can create and publish an agent.
- Published agent works in chat.
- Agent survives backend restart.
- Protected agents cannot be deleted.
- Invalid tool and model references are rejected.
- Historical conversations survive archival.

## 2. Approach: Simple Active/Draft Model (Two-row max)

Instead of a complex full history of version numbers, we store up to two rows per agent in the SQLite database:
1. One row with `status = 'published'` (active configuration, immutable).
2. One row with `status = 'draft'` (working configuration, mutable).

When editing a published agent for the first time, we copy its published row to a `'draft'` row. Editing updates the draft. Publishing overwrites the `'published'` row with the draft configuration and deletes the `'draft'` row. Archiving changes `'published'` to `'archived'`.

Conversations are bound to either a published or draft version of the agent via an `agentVersion` column in the `conversations` table. Draft-testing chats set `agentVersion = 'draft'`.

## 3. Database Schema (`packages/database`)

### 3.1 Drizzle Schema Changes (`packages/database/src/schema.ts`)

Add the `storedAgents` table and update the `conversations` table.

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
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull(), // JSON string array
  toolIds: text('tool_ids', { mode: 'json' }).$type<string[]>().notNull(), // JSON string array
  primaryModelProfileId: text('primary_model_profile_id')
    .references(() => modelProfiles.id, { onDelete: 'restrict' }), // Nullable in draft, required in publish
  fallbackModelProfileIds: text('fallback_model_profile_ids', { mode: 'json' })
    .$type<string[]>()
    .default(sql`'[]'`)
    .notNull(), // JSON string array
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

// Update conversations schema to track agent_version:
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

### 3.2 SQL Migrations (`packages/database/src/index.ts`)

Update `initDb()`:
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

// Add agent_version column dynamically to conversations if missing
try {
  await client.execute(`ALTER TABLE conversations ADD COLUMN agent_version TEXT DEFAULT 'published' NOT NULL;`)
} catch {
  // Column already exists
}
```

## 4. Agent Server & Runtime resolution (`apps/agent-server`)

### 4.1 Agent Resolver Updates (`apps/agent-server/src/agents/resolver.ts`)

Add new data access properties to `AgentRuntimeDeps`:
```typescript
export interface StoredAgentRow {
  readonly id: string
  readonly status: 'draft' | 'published' | 'archived'
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly category: 'qa' | 'research' | 'productivity' | 'social' | 'custom'
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
  // Added for stored agents:
  listStoredAgents(status?: 'draft' | 'published' | 'archived'): Promise<StoredAgentRow[]>
  findStoredAgent(id: string, status: 'draft' | 'published' | 'archived'): Promise<StoredAgentRow | undefined>
}
```

Modify resolver helpers:
- `resolveCatalog(deps)`: Retrieve all built-in agents AND all published stored agents. Check configuration criteria (primary model profile + provider connection are approved and enabled) for both.
- `resolveAgent(deps, id, version)`: Retrieve the agent by ID. If version is `'draft'`, load from draft stored agents. If `'published'`, look first in built-in agents. If not found, look in published stored agents.

### 4.2 Dynamic Agent Compilation (`apps/agent-server/src/agents/build.ts`)

Instead of compiling only built-in agents at boot, we compile agents dynamically on demand using the custom configuration stored in the database.
```typescript
export async function buildDynamicAgent(
  deps: MastraAgentDeps,
  agentId: string,
  version: 'published' | 'draft',
): Promise<Agent> {
  // 1. Resolve agent manifest and prompt instructions
  let manifest: AgentManifest
  let instructions: string
  
  if (version === 'published') {
    const builtIn = deps.listBuiltIn().find(a => a.manifest.id === agentId)
    if (builtIn) {
      manifest = builtIn.manifest
      instructions = builtIn.instructions
    } else {
      const stored = await deps.findStoredAgent(agentId, 'published')
      if (!stored) throw new Error(`Agent not found: ${agentId}`)
      manifest = mapStoredToManifest(stored)
      instructions = stored.instructions
    }
  } else {
    const stored = await deps.findStoredAgent(agentId, 'draft')
    if (!stored) throw new Error(`Draft agent not found: ${agentId}`)
    manifest = mapStoredToManifest(stored)
    instructions = stored.instructions
  }

  // 2. Build model resolver using stored profile bindings
  const sessionStore = deps.sessionStore ?? new BrowserSessionStore()
  const memory = deps.memory ?? new Memory({
    storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
  })

  return new Agent({
    id: manifest.id,
    name: manifest.name,
    instructions: instructions,
    model: () => resolveModelForManifest(deps, agentId, manifest, version),
    tools: buildBrowserTools(sessionStore), // Available tools configured for the system
    memory,
  })
}
```

### 4.3 Builder API Endpoints (`apps/agent-server/src/mastra/routes/builder.ts`)

Define routing under `/api/builder/agents`:
- `GET /api/builder/agents` - Returns all stored agent rows.
- `POST /api/builder/agents` - Creates a new stored agent with `'draft'` status. Checks ID constraints (reserved ID, lowercase kebab-case, uniqueness).
- `PUT /api/builder/agents/:id` - Updates the draft row. If editing a published agent that does not have an active draft, copies the published config into a new `'draft'` row first, then applies edits.
- `POST /api/builder/agents/:id/publish` - Promotes the draft:
  - Validates schema (primary model profile must be approved/enabled).
  - Overwrites (upserts) the published row, then deletes the draft row.
- `POST /api/builder/agents/:id/archive` - Moves status of published agent to `'archived'`.
- `DELETE /api/builder/agents/:id` - Deletes draft and published/archived rows for user-created agents. Rejects if protected (built-in).

### 4.4 Conversation API Update (`apps/agent-server/src/mastra/routes/conversations.ts`)

- `POST /api/conversations`: Accepts `{ agentId, agentVersion }` (agentVersion defaults to `'published'`). Saves the `agentVersion` in the DB row. Rejects conversation creation if the specified version of the agent does not exist or is not configured.

## 5. Web App UI (`apps/web`)

### 5.1 Route Configuration
- Create `/builder` page in Next.js linking to `features/builder/index.tsx`.
- Create `/builder/new` for creation form.
- Create `/builder/[id]/edit` for editing form.

### 5.2 Form UI Elements
- **Basic Info**: Name, Description, Category.
- **ID Input**: Handled as lowercase text with validation feedback. Disabled during editing.
- **Prompt Input**: Textarea for instructions.
- **Model Selector**: Pulls approved model profiles.
- **Tool Selector**: Multi-checkbox for available tools.
- **Memory Settings**: Toggles and mode selection.

### 5.3 Test & Publish Workflow
- In the builder, clicking **Test Draft** creates a new conversation with `{ agentId, agentVersion: 'draft' }` and redirects to the chat view.
- **Publish** promotes the draft and opens it to normal catalog availability.

## 6. Testing Strategy

- Database: Validate CRUD, primary key composite constraint, cascade, and conversation version tracking.
- Resolver: Test catalog merging, draft vs published fallback, and model validation.
- Builder API: Unit and integration tests for Honó routes covering CRUD, validation errors, and lifecycle status updates.
- Web: Test forms, validation alerts, client-side lifecycle execution hooks, and API adapter integration.
