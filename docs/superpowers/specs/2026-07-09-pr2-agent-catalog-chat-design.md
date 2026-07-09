# PR-2 Design: Agent Catalog and Chat

- **Status:** Approved (Approach A)
- **Branch:** `feat/agent-catalog-chat`
- **Date:** 2026-07-09
- **Reviewer:** Mas Gitgit
- **Depends on:** PR-1 (Provider Registry) — merged

## 1. Goal

Deliver the first working agent experience: users open an Agent Catalog, pick an agent (QA Web Agent), chat with it over a persisted conversation, watch tool activity stream in, and approve consequential browser actions. Satisfies ROADMAP PR-2 acceptance criteria:

- Catalog lists QA Web Agent.
- User can chat with it.
- Conversation survives reload.
- Conversation cannot silently switch agents.
- Browser testing works.
- No generic `main-agent` is required.

## 2. Approach

**Approach A — Mastra-native runtime + thin Aether layer.** Use Mastra `Agent` + `Memory` + native `requireToolApproval` / `approveToolCall`. Aether adds a manifest registry, `conversations`/`tool_events` tables, custom SSE routes wrapping `agent.stream()`, and Playwright browser tools as Mastra tools.

Rejected alternatives:

- **B — Custom agent loop** (manual `streamText` orchestration): reinvents memory/threading/persistence; diverges from "host Mastra".
- **C — Raw Mastra endpoints, no custom routes:** cannot enforce agentId immutability, validation, approval UX, tool-event capture, or the secret boundary uniformly; breaks the controlled-route pattern established in PR-1.

## 3. Type and Contract Layer (`packages/shared`)

Canonical contract types live in `packages/shared` so the web app and agent-server share one source of truth (no local re-declaration drift). Add `src/agents.ts` and `src/conversation.ts`, re-exported from `src/index.ts`.

```ts
// src/agents.ts
export type AgentSource = 'code' | 'stored';
export type AgentStatus = 'draft' | 'published' | 'archived';
export type AgentCategory = 'qa' | 'research' | 'productivity' | 'social' | 'custom';

export interface AgentModelBinding {
  primaryModelProfileId: string;
  fallbackModelProfileIds: string[];
}

export interface AgentManifest {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  source: AgentSource;
  status: AgentStatus;
  protected: boolean;
  capabilities: string[];
  toolIds: string[];
  modelBinding: AgentModelBinding | null; // null until an admin binds a profile
  memory: { enabled: boolean; mode: 'thread' | 'resource-and-thread' };
  visibility: 'private' | 'internal' | 'public';
  createdAt: string;
  updatedAt: string;
}

// Catalog entry: manifest plus a runtime readiness flag.
export interface CatalogAgent {
  manifest: AgentManifest;
  configured: boolean; // true when a usable model binding + profile + connection exist
}
```

```ts
// src/conversation.ts
export interface Conversation {
  id: string;
  userId: string;
  agentId: string;
  threadId: string;     // Mastra memory thread
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type ToolEventStatus =
  | 'requested' | 'approved' | 'denied'
  | 'running' | 'success' | 'error';

export interface ToolEvent {
  id: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  riskLevel: 'read' | 'interactive' | 'consequential' | 'system';
  status: ToolEventStatus;
  input: unknown;
  output: unknown;
  error: { code: string; message: string } | null;
  startedAt: string;
  endedAt: string | null;
}
```

Rules honored: IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; reserved `qa-web-agent`, `qa-mobile-agent`; no generic `main-agent` (ADR-005); agent-scoped conversations (ADR-010).

## 4. Database (`packages/database`)

Add two tables to `src/schema.ts` (Drizzle) and the corresponding idempotent `CREATE TABLE IF NOT EXISTS` blocks to `initDb()` in `src/index.ts`. No new migration framework.

```text
conversations(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

tool_events(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT NOT NULL,        -- JSON string
  output TEXT,                -- JSON string, nullable
  error TEXT,                 -- JSON string, nullable
  started_at TEXT NOT NULL,
  ended_at TEXT
)
```

**Messages are NOT stored in these tables.** Message history uses Mastra `Memory` over the existing `LibSQLStore`, keyed by `threadId` + `resourceId`(=userId). `conversations.threadId` is the bridge. This gives persistence, reload, and streaming memory without duplicating storage.

## 5. Agent Package (`packages/agents`, new)

Holds built-in agent *declarations* only — no Mastra import (dependency rule: `packages/agents → shared`). Mastra `Agent` construction happens in `apps/agent-server`.

```ts
// packages/agents/src/qa-web.ts
export const QA_WEB_AGENT = {
  manifest: {
    id: 'qa-web-agent',
    name: 'QA Web Agent',
    description: 'Drives a browser to test web apps and reports structured QA findings.',
    category: 'qa',
    source: 'code',
    status: 'published',
    protected: true,
    capabilities: ['browser-testing', 'form-testing', 'evidence-collection', 'qa-reporting'],
    toolIds: ['browser.navigate', 'browser.snapshot', 'browser.click', 'browser.type', 'browser.screenshot'],
    modelBinding: null, // resolved at runtime from agent_model_bindings
    memory: { enabled: true, mode: 'thread' },
    visibility: 'internal',
    createdAt: '<build-time>',
    updatedAt: '<build-time>',
  } satisfies AgentManifest,
  instructions: '... system prompt for QA web testing ...',
};
```

`packages/agents/src/index.ts` exports a `BUILT_IN_AGENTS` array and helpers (`getBuiltIn(id)`, `listBuiltIn()`). Reserved-id and ID-format validation helpers live here too.

## 6. Tool Package (`packages/tools`, new)

Playwright-backed browser tools exposed as Mastra tools. Add `playwright` to `packages/tools` dependencies (rule: `packages/tools → shared + external SDKs`).

Tools (MVP set):

| Tool | Risk | Approval |
|---|---|---|
| `browser.navigate` | interactive | no |
| `browser.snapshot` | read | no |
| `browser.screenshot` | read | no |
| `browser.click` | interactive | **yes** |
| `browser.type` | interactive | **yes** |

**Session isolation:** a `BrowserSessionStore` maps `conversationId → Playwright BrowserContext`. Contexts are created lazily on first browser tool call for a conversation, isolated (separate storage/cookies), and closed on conversation end or an idle timeout. No auth state leaks across conversations.

Each tool is `createTool({ id, description, inputSchema: zod, execute })`. Risk metadata is declared alongside and mirrored into `tool_events`.

> **Plan-time verification item:** confirm whether Mastra supports per-tool approval declaration or only stream-level `requireToolApproval`. If per-tool is unsupported, gate click/type via a `suspend()`-based custom approval check inside `execute` and reconcile with the SSE approval flow. Resolve during planning before wiring.

## 7. Agent Server (`apps/agent-server`)

### 7.1 Runtime wiring (`src/mastra/index.ts`)

Add `agents:` to the Mastra instance. Built at boot by resolving each built-in agent's binding from `agent_model_bindings` (PR-1) → `model_profiles` → `provider_connections` → `getAdapter(type).resolveModel(baseUrl, apiKey, profile)` → `LanguageModelV1`. Each agent gets `memory: new Memory({ storage })` and its assigned tools. Agents with no usable binding are registered but marked `configured: false` in the catalog.

### 7.2 Agent resolver (`src/agents/resolver.ts`)

```ts
interface AgentResolver {
  listCatalog(): Promise<CatalogAgent[]>;      // published code agents (stored agents added in PR-3)
  get(agentId: string): Promise<ResolvedAgent | null>;
}
interface ResolvedAgent {
  manifest: AgentManifest;
  configured: boolean;
  mastraAgent: Agent;        // null when not configured
}
```

Archived agents cannot start new conversations; sending to an unconfigured agent returns `NOT_CONFIGURED`.

### 7.3 Routes (`src/mastra/routes/`)

New files, following the PR-1 DI pattern (`createXxxRoutes(deps)` + production wiring):

- `agents.ts`
  - `GET /api/agents` → `CatalogAgent[]` (published only; hide draft/archived per PRODUCT §7).
  - `GET /api/agents/:id` → `CatalogAgent` (404 if not published).
- `conversations.ts`
  - `POST /api/conversations` `{ agentId }` → create conversation for `env.AETHER_LOCAL_USER_ID`; reject archived/unconfigured agent; 404 unknown agent.
  - `GET /api/conversations` → user's conversations.
  - `GET /api/conversations/:id` → conversation + messages (pulled from Mastra memory by `threadId`).
- `chat.ts`
  - `POST /api/conversations/:id/messages` `{ text }` → **SSE** stream.
    - Validate conversation belongs to user; resolve agent; persist user message to memory; run `mastraAgent.stream(text, { memory: { thread: threadId, resource: userId }, requireToolApproval })`.
    - SSE events: `text` (delta), `tool_start`, `tool_approval_required` (`{ toolCallId, toolName, args }`), `tool_result`, `message_end`, `error`.
    - Record `tool_events` rows as tool calls occur.
  - `POST /api/conversations/:id/approvals/:toolCallId` `{ decision: 'approve' | 'deny' }` → `agent.approveToolCall()` or decline; resumes the suspended stream.

### 7.4 agentId immutability

`agentId` is set when the conversation is created and is never updated. The chat route never accepts an `agentId` override; selecting another agent always creates a new conversation (ADR-010). Any path that could mutate it returns 409.

### 7.5 Env (`src/config/env.ts`)

Add (no `.default()`/`.optional()` — Mastra zod-v4 `toJSONSchema` rule):

- `AETHER_DEFAULT_AGENT_ID` (seeded to `qa-web-agent` in `vitest.setup.js`).
- `AETHER_LOCAL_USER_ID` (seeded to `local-user`).

`.env.example` updated for both apps.

### 7.6 SSE in custom routes

> **Plan-time verification item:** confirm the exact return shape for a streaming custom `apiRoute` (Hono `c.streamSSE` vs returning a `Response` with a `ReadableStream`). Resolve during planning before implementing the chat route.

## 8. Default Agent and Auth Placeholders

- **Default agent:** `AETHER_DEFAULT_AGENT_ID` (default `qa-web-agent`). Catalog opens this agent's conversation by default. It is a named pointer to a real specialized agent — not an ambiguous `main-agent` (ADR-005).
- **Auth/userId:** `AETHER_LOCAL_USER_ID` (default `local-user`) until a real auth system lands. All conversations are scoped to this single local user. Clearly marked as a placeholder; not a multi-user system.

## 9. Web App (`apps/web`)

Conventions: Tailwind v4, CSS-var design tokens, `useToast()`, `'use client'`, lucide-react, server page → client feature component (per existing providers feature).

### 9.1 Catalog — `/agents`

- `src/app/agents/page.tsx` (server) → `src/features/agents/index.tsx` (client).
- Grid of `CatalogAgent` cards: name, description, capabilities chips, `configured`/`protected` badges. "Start conversation" opens `/chat/[conversationId]` (creates a conversation first). Unconfigured agents are shown disabled with a hint to bind a model in Provider Settings.
- `/` redirects to `/agents`.

### 9.2 Chat — `/chat/[conversationId]`

- `src/features/chat/`: orchestrator + components.
  - `chat-api.ts` — streaming SSE client (fetch + `ReadableStream` reader) following `provider-api.ts` conventions but stream-capable; plus non-streaming helpers (`listAgents`, `createConversation`, `getConversation`, `submitApproval`).
  - Components: `MessageList`, `Composer`, `ToolTimeline` (renders `tool_events`: tool name, status, input/output, screenshot evidence), `ApprovalBar` (Approve/Deny on `tool_approval_required`).
- Conversation survives reload (messages re-fetched from `getConversation`).
- Cannot switch agent mid-conversation in the UI; choosing another agent starts a new conversation.

### 9.3 Shell and bindings

- `src/components/shell.tsx`: add nav link to `/agents`.
- `src/features/providers/components/AgentBindingManager.tsx`: replace the hardcoded `qa-web-agent` option with the dynamic agent list from `GET /api/agents`.

## 10. Testing

Follow the PR-1 patterns: DI via `createXxxRoutes(deps)`, synthetic Hono context, `vi.fn` mocks, in-memory LibSQL (`file::memory:` + `initDb()`).

- `packages/shared`: manifest/conversation type sanity (no behavior).
- `packages/agents`: reserved-id + ID-format validation; built-in catalog lists qa-web only.
- `packages/tools`: browser tools with mocked Playwright (`BrowserSessionStore` lifecycle, isolation).
- `packages/database`: `conversations`/`tool_events` CRUD + cascade.
- `apps/agent-server`:
  - Resolver: configured flag from binding presence.
  - Agent routes: catalog hides draft/archived; 404 unknown.
  - Conversation routes: create/list/get; **agentId immutability** (409 on any mismatch path); archived agent cannot start.
  - Chat route: SSE event shape with a mocked `mastraAgent.stream`; user message persisted; `tool_events` recorded; approval resume calls `approveToolCall`/decline.
  - Env: new fields parse/required.
- `apps/web`: `chat-api.ts` SSE parsing unit test; existing toast/provider tests unchanged.

Validation commands (run from repo root): `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, `npm run build`.

## 11. Out of Scope

- Authentication and multi-user (single local-user placeholder only).
- Agent Builder / stored agents (PR-3).
- `web_search` / `web_fetch` (PR-4).
- Full browser family: `browser.select`, `browser.press`, `browser.extract`, plus auth/anti-bot handling and headed-mode options — later follow-up.
- Production secret-manager integration; CI workflow restoration.

## 12. Open Items to Resolve in the Plan (not blockers)

1. Mastra per-tool approval vs stream-level `requireToolApproval` — confirm API and pick the gating implementation for click/type.
2. Exact streaming return shape for a custom `apiRoute` (`c.streamSSE` vs streaming `Response`).
3. Whether `packages/agents` needs an `@aether/shared` workspace dep declared explicitly in its `package.json`.
4. Playwright browser-binary install strategy in this environment (postinstall vs documented manual step).
