# Aether Foundation Documentation

---

<!-- Source: README.md -->

# Aether

Aether is a multi-agent gateway and builder for running specialized AI agents through one user-facing application.

The initial scope is intentionally limited to Fikri's RafiqSpace internship workstream:

- Agent Catalog and chat per agent
- Database-backed Agent Builder
- Multi-provider LLM support
- QA Web Agent
- Web Search and Web Fetch tools
- QA Mobile Agent with Maestro
- Integration contracts for agents and tools built by other team members

Aether does not implement every team deliverable in its first version. PM Agent, Social Media Agent, Telegram or Discord channels, Time Tools, Email Tools, Google Drive, and OCR remain external modules that can be integrated later through stable contracts.

## Product Principles

1. **Provider agnostic**: OpenAI, Anthropic, Google Gemini, OpenRouter, and custom OpenAI-compatible endpoints such as internal Rafiq gateways.
2. **Agent-specific model policy**: specialized agents use tested model profiles; end users do not freely swap models on every message.
3. **Agent isolation**: every conversation belongs to one agent.
4. **Control plane separated from runtime**: Agent Builder manages configuration; agents execute tasks.
5. **Modular tools**: browser automation, web research, and mobile testing are separate capabilities.
6. **Production-oriented defaults**: secrets stay server-side, endpoints are validated, and built-in agents are protected.

## Initial Agents

| Agent ID | Name | Purpose |
|---|---|---|
| `qa-web-agent` | QA Web Agent | Browser-based web application testing |
| `qa-mobile-agent` | QA Mobile Agent | Android APK testing through Maestro |
| Stored agent IDs | Custom Agents | Agents created and published through Agent Builder |

There is no ambiguous generic `main-agent` in the fresh architecture. The landing page should display the Agent Catalog. A configurable default agent may be set through environment configuration.

## Initial Tools

| Tool ID | Purpose |
|---|---|
| `browser.*` | Browser automation and web QA |
| `web_search` | Search through a managed SearXNG instance |
| `web_fetch` | Fetch and extract readable web content |
| `mobile.*` | Inspect APKs, manage devices, and execute Maestro flows |

## Repository Layout

```text
aether/
├── apps/
│   ├── web/
│   └── agent-server/
├── packages/
│   ├── agents/
│   ├── agent-builder/
│   ├── providers/
│   ├── tools/
│   ├── database/
│   └── shared/
├── infra/
│   └── searxng/
├── docs/
└── package.json
```

See the documents in `docs/` for the complete product, architecture, provider, agent, tool, roadmap, and decision contracts.

---

<!-- Source: docs/PRODUCT.md -->

# Aether Product Requirements

## 1. Product Summary

Aether is a user-facing agent gateway that allows users to discover, create, configure, and chat with specialized AI agents through one application.

The first version focuses only on the workstream assigned to Fikri:

1. Rebuild the chat application with a cleaner foundation.
2. Preserve and improve the Agent Builder.
3. Support multiple LLM providers.
4. Provide QA Web Agent access.
5. Build Web Search and Web Fetch tools using SearXNG.
6. Extend QA capabilities to Android APK testing with Maestro.
7. Expose stable contracts so agents and tools developed by other team members can be integrated later.

## 2. Problem Statement

The previous prototype was centered around one browser-capable agent. The product direction later changed into a gateway for multiple agents. Continuing to extend the original structure would create ambiguity around default-agent identity, agent registration, conversation isolation, provider credentials, tool assignment, and stored-agent lifecycle.

Aether addresses this by separating the agent runtime, provider layer, Agent Builder, tools, and user interface.

## 3. Goals

### Primary Goals

- Provide an Agent Catalog.
- Allow direct chat with a selected agent.
- Keep conversation history separated per agent.
- Allow stored agents to be created through Agent Builder.
- Support OpenAI, Anthropic, Google Gemini, OpenRouter, and custom OpenAI-compatible endpoints.
- Keep secrets on the server.
- Support QA Web workflows.
- Provide Web Search and Web Fetch tools.
- Prepare QA Mobile support with Maestro.
- Make external agents and tools easy to register.

### Secondary Goals

- Support tested model fallback profiles.
- Support draft and published agent versions.
- Provide tool capability metadata.
- Provide audit metadata for configuration changes.
- Keep the platform extensible without implementing a supervisor agent initially.

## 4. Non-Goals for the Initial Version

- Supervisor or multi-agent delegation
- PM Agent implementation
- Social Media Agent implementation
- Telegram or Discord implementation
- Time Tools
- Email Tools
- Google Drive Connector
- OCR integration
- Multi-tenant organizations
- Billing
- Agent marketplace
- Arbitrary user-defined MCP servers
- iOS mobile testing
- Multi-device parallel execution
- Kubernetes deployment

## 5. User Roles

### User

Can view agents, chat with published agents, view their own conversation history, and use tools indirectly through an agent. Cannot view provider secrets, register arbitrary endpoints, delete protected agents, or replace protected-agent models.

### Agent Creator

Can create a stored agent, define metadata and instructions, select an approved model profile, select approved tools, configure supported memory, save drafts, test drafts, publish, archive, and edit their own stored agents.

### Administrator

Can create provider connections, store or rotate credentials, register approved models, configure custom OpenAI-compatible endpoints, enable or disable models, configure fallbacks, and manage protected agents and approved tools.

## 6. Core User Flows

### Agent Catalog

```text
Open Aether
→ View Agent Catalog
→ Select an agent
→ Open or create a conversation
→ Send a message
→ Agent executes with its configured model and tools
```

### Agent Builder

```text
Open Agent Builder
→ Create stored agent
→ Define metadata and instructions
→ Select approved model profile
→ Select allowed tools
→ Save draft
→ Test draft
→ Publish
→ Agent appears in Agent Catalog
```

### Provider Administration

```text
Open Provider Settings
→ Select provider type
→ Enter server-side credential
→ Validate connection
→ Register model profiles
→ Mark models as approved
→ Bind approved model to an agent
```

### QA Web

```text
Select QA Web Agent
→ Provide target URL and testing objective
→ Agent opens browser
→ Agent runs approved browser actions
→ Agent records findings
→ Agent returns structured QA results
```

### Web Research

```text
Agent receives research task
→ Calls web_search
→ Selects relevant results
→ Calls web_fetch
→ Synthesizes answer with source metadata
```

### QA Mobile

```text
Upload APK
→ Validate APK
→ Detect application ID
→ Select connected device
→ Install APK
→ Generate Maestro flow
→ Execute tests
→ Collect results and screenshots
→ Generate QA report
```

## 7. Functional Requirements

### Agent Catalog

- Show built-in and published stored agents.
- Show name, description, capabilities, and availability.
- Distinguish protected built-in agents from stored agents.
- Hide draft and archived agents from normal users.
- Allow a configurable default agent.
- Avoid an ambiguous generic `main-agent` identity.

### Conversation

- Every conversation stores `agentId`.
- Messages are persisted server-side.
- Switching agents creates or opens a separate conversation.
- Historical conversations remain readable if an agent is archived.
- Sending to a deleted or unavailable agent is blocked safely.
- Streaming responses are supported.
- Tool calls and tool results can be shown in a timeline.

### Agent Builder

Minimum fields:

- Agent ID
- Name
- Description
- Instructions
- Model profile
- Allowed tools
- Memory configuration
- Status

Validation:

- IDs use lowercase kebab-case.
- IDs are unique.
- Protected IDs cannot be reused.
- Model profiles must be approved.
- Tool IDs must exist.
- Instructions are required.
- Publishing requires a valid complete configuration.

Lifecycle:

```text
Draft → Published → Archived
```

### Provider Management

Supported provider types:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter
- OpenAI-compatible custom endpoint

Requirements:

- Credentials remain server-side.
- Credentials are never returned to the browser.
- Custom endpoints require HTTPS in production.
- Private IP and localhost endpoints are disabled unless explicitly allowed in local development.
- Each provider connection has a health state.
- Model profiles include capability metadata.
- Specialized agents use approved models only.

### QA Web Agent

- Browser automation
- Approval controls for consequential actions
- Configurable test objectives
- Structured QA results
- Screenshot or evidence support where available
- Clear handling of authentication and anti-automation blocking

### Web Search

- Use a managed SearXNG instance.
- Return normalized search results.
- Support result limits, language, and optional time filters.
- Return title, URL, snippet, engine, and rank when available.

### Web Fetch

- Fetch HTTP and HTTPS only.
- Enforce timeout and response-size limits.
- Validate content type.
- Block SSRF targets.
- Limit redirects.
- Extract readable text or Markdown.
- Preserve source URL, title, and retrieval timestamp.

### QA Mobile

Initial support:

- Android APK only
- Local device or emulator
- One device per run
- Maestro CLI and ADB
- Generated YAML flow
- Screenshots and structured test results

## 8. Model Policy

### Built-In Specialized Agents

Use a fixed primary model profile and optional tested fallbacks. Users cannot replace the model during a conversation.

### Stored Agents

Creators select from approved model profiles. Free-form provider endpoints and API keys are not accepted in the normal Agent Builder form.

### Provider-Specific Features

Use native integrations for OpenAI, Anthropic, and Google when provider-specific features matter. Use OpenRouter as a gateway and custom OpenAI-compatible gateways for Rafiq and similar endpoints.

## 9. Non-Functional Requirements

### Security

- No browser-side API key storage
- Input validation at every external boundary
- SSRF protection
- Allowlisted mobile commands
- No arbitrary shell execution from the LLM
- Protected built-in agents
- Audit metadata for provider and agent changes

### Reliability

- Provider health checks
- Bounded retries
- Tested fallback profiles
- Graceful errors
- Conversation persistence

### Maintainability

- Modular monorepo
- Stable contracts
- Shared validation schemas
- No circular package dependencies
- Clear runtime and control-plane separation

### Observability

Track request ID, agent ID, conversation ID, provider connection ID, model profile ID, tool call status, latency, and sanitized error category. Do not log secrets or full message content by default.

## 10. Initial Product Completion

The initial product is complete when users can browse agents, chat with QA Web Agent, persist conversations per agent, manage stored agents through draft and publish, configure approved multi-provider models server-side, use Web Search and Web Fetch, and run an Android APK test through Maestro.

---

<!-- Source: docs/ARCHITECTURE.md -->

# Aether Architecture

## 1. Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                       Aether Web App                         │
│ Agent Catalog · Chat · Agent Builder · Provider Settings    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / streaming
┌──────────────────────────────▼──────────────────────────────┐
│                     Aether Agent Server                     │
│ API · Auth Boundary · Agent Runtime · Tool Runtime          │
└───────────┬──────────────────┬──────────────────┬───────────┘
            │                  │                  │
┌───────────▼────────┐ ┌───────▼────────┐ ┌──────▼───────────┐
│ Agent Registry     │ │ Provider Layer │ │ Tool Registry     │
│ Built-in + Stored  │ │ Native+Gateway │ │ Browser/Web/Mobile│
└───────────┬────────┘ └───────┬────────┘ └──────┬───────────┘
            │                  │                  │
┌───────────▼──────────────────▼──────────────────▼───────────┐
│                    Storage and Infrastructure               │
│ Agents · Versions · Conversations · Secrets · SearXNG      │
└─────────────────────────────────────────────────────────────┘
```

## 2. Components

### Web Application

Responsibilities:

- Agent Catalog
- Chat per agent
- Tool execution timeline
- Agent Builder
- Provider administration
- APK upload
- Typed communication with the agent server
- No persistent raw provider credentials

### Agent Server

Responsibilities:

- Host Mastra
- Resolve agents and model profiles
- Execute tools
- Stream responses
- Persist conversations
- Enforce authorization
- Validate external input
- Read provider secrets securely

### Agent Registry

Normalizes code-defined and database-stored agents.

```ts
interface RegisteredAgent {
  id: string;
  source: 'code' | 'stored';
  protected: boolean;
  status: 'draft' | 'published' | 'archived';
  manifest: AgentManifest;
}
```

### Provider Registry

Separates provider connection, model profile, and agent binding:

```text
Provider Connection
    └── Model Profiles
            └── Agent Bindings
```

### Tool Registry

Provides unique IDs, schemas, risk level, approval policy, runtime handler, health, and capability metadata. An agent receives only explicitly assigned tools.

## 3. Monorepo Structure

```text
aether/
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   ├── src/components/
│   │   ├── src/features/agents/
│   │   ├── src/features/chat/
│   │   ├── src/features/providers/
│   │   ├── src/features/mobile-qa/
│   │   └── src/lib/
│   └── agent-server/
│       ├── src/mastra/
│       ├── src/api/
│       ├── src/services/
│       ├── src/security/
│       ├── src/config/
│       └── src/index.ts
├── packages/
│   ├── agents/
│   │   ├── qa-web/
│   │   └── qa-mobile/
│   ├── agent-builder/
│   ├── providers/
│   │   ├── registry/
│   │   ├── native/
│   │   ├── openrouter/
│   │   └── openai-compatible/
│   ├── tools/
│   │   ├── browser/
│   │   ├── web-research/
│   │   └── mobile/
│   ├── database/
│   └── shared/
├── infra/
│   ├── searxng/
│   └── docker-compose.yml
├── docs/
├── .github/workflows/
├── .env.example
├── package.json
└── README.md
```

## 4. Dependency Rules

```text
apps/web → shared types and typed API client
apps/agent-server → agents, agent-builder, providers, tools, database, shared
packages/agents → provider and tool interfaces, shared
packages/tools → shared and external SDKs
packages/providers → shared and provider SDKs
packages/database → shared
```

Disallowed:

- Provider packages importing UI code
- Tool packages importing agent implementations
- Shared importing application code
- Web app importing provider secrets
- Agent implementations directly querying storage outside services

## 5. Chat Request Flow

```text
Web App
→ Submit conversation message
→ Validate user and conversation
→ Load conversation.agentId
→ Resolve agent
→ Resolve model binding
→ Load provider credential
→ Attach approved tools
→ Run agent
→ Persist user message, tool events, and assistant message
→ Stream events to client
```

## 6. Agent Creation and Publish

```text
Create draft
→ Validate ID and metadata
→ Validate model profile
→ Validate tools
→ Store draft version
→ Test draft
→ Publish immutable version
→ Expose in Agent Catalog
```

## 7. Conversation Model

```ts
interface Conversation {
  id: string;
  userId: string;
  agentId: string;
  threadId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- `agentId` is immutable after the first message.
- Switching agents creates another conversation.
- Agent deletion or archival does not delete historical conversations.

## 8. Provider Architecture

### Native Providers

Use native integrations for OpenAI, Anthropic, and Google Gemini.

### OpenRouter

Use as an additional gateway, development option, and tested fallback source. Do not assume every provider-specific feature survives the compatibility layer.

### Custom OpenAI-Compatible Gateway

Use for Rafiq, vLLM, LM Studio in development, and approved compatible services. Require server-side URL, credential, health check, capability verification, and production URL restrictions.

## 9. Tool Security

| Level | Meaning | Example |
|---|---|---|
| `read` | No external mutation | Web Search, Web Fetch |
| `interactive` | Temporary interaction | Browser navigation and typing |
| `consequential` | External side effect | Form submission or email |
| `system` | Local system or device operation | APK install and Maestro execution |

Only explicit tool assignments are allowed. Consequential and system tools may require approval. Tool inputs, outputs, timeouts, and cancellations are enforced.

## 10. Web Research Architecture

```text
Agent
├── web_search → SearXNG JSON API
└── web_fetch
    ├── URL validation
    ├── DNS/IP validation
    ├── bounded fetch
    ├── readable-content extraction
    └── normalized document
```

SearXNG performs discovery. Web Fetch performs content retrieval.

## 11. Mobile QA Architecture

```text
Aether Web
→ APK upload
→ temporary storage
→ APK inspector
→ ADB device service
→ installer/launcher
→ Maestro flow generator
→ Maestro runner
→ artifact collector
→ QA report
```

No arbitrary shell command is exposed to the LLM.

## 12. Deployment Stages

### Local

- Local LibSQL
- Local SearXNG via Docker Compose
- Environment-file secrets
- Local browser and Android emulator

### Staging

- Managed database
- Managed secrets
- Deployed SearXNG
- Restricted custom gateways
- Structured logs

### Production

- Encrypted secrets
- Authentication and authorization
- Database backups
- Provider health monitoring
- Rate limiting
- Audit logs
- Artifact retention policy
- Network egress restrictions
- HTTPS-only custom providers

---

<!-- Source: docs/PROVIDER_CONTRACT.md -->

# Aether Provider Contract

## 1. Purpose

The provider layer allows Aether agents to use models from different vendors without embedding provider-specific credentials and routing logic inside each agent.

Initial support:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter
- Custom OpenAI-compatible endpoints

## 2. Core Entities

### Provider Connection

```ts
type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'openai-compatible';

interface ProviderConnection {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  secretRef: string;
  enabled: boolean;
  status: 'untested' | 'healthy' | 'degraded' | 'unavailable';
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- `secretRef` points to secure server-side storage.
- Raw secrets are never returned through API responses.
- `baseUrl` is required only for custom OpenAI-compatible providers.
- Disabled connections cannot serve new requests.

### Model Profile

```ts
interface ModelCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  fileInput: boolean;
  reasoning: boolean;
}

interface ModelProfile {
  id: string;
  providerConnectionId: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
  approved: boolean;
  enabled: boolean;
  defaultSettings?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

An approved model must have verified capability metadata. Agent Builder lists only approved and enabled profiles.

### Agent Model Binding

```ts
interface AgentModelBinding {
  agentId: string;
  primaryModelProfileId: string;
  fallbackModelProfileIds: string[];
}
```

Fallback models are ordered and should pass the same evaluation suite as the primary model.

## 3. Provider Adapter Interface

```ts
interface ProviderAdapter {
  readonly type: ProviderType;

  validateConnection(
    input: ProviderConnectionInput
  ): Promise<ConnectionValidationResult>;

  listModels?(
    connection: ProviderConnectionRuntime
  ): Promise<DiscoveredModel[]>;

  resolveModel(
    connection: ProviderConnectionRuntime,
    profile: ModelProfile
  ): Promise<ResolvedLanguageModel>;

  healthCheck(
    connection: ProviderConnectionRuntime
  ): Promise<ProviderHealthResult>;
}
```

## 4. Provider Strategy

### OpenAI

Use a native OpenAI adapter.

```env
OPENAI_API_KEY=
```

### Anthropic

Use a native Anthropic adapter rather than forcing all Claude traffic through an OpenAI compatibility layer.

```env
ANTHROPIC_API_KEY=
```

### Google Gemini

Use a native Google adapter.

```env
GOOGLE_GENERATIVE_AI_API_KEY=
```

### OpenRouter

Use OpenRouter as a distinct gateway.

```env
OPENROUTER_API_KEY=
```

OpenRouter model profiles must explicitly record tested capabilities.

### Custom OpenAI-Compatible

Use for internal or approved third-party endpoints such as Rafiq.

```env
RAFIQ_LLM_BASE_URL=
RAFIQ_LLM_API_KEY=
```

A custom connection requires display name, base URL, API key, optional headers, model configuration, health check, and capability tests.

## 5. Secret Handling

Development may use ignored `.env` files.

Production should use deployment secrets, a cloud secret manager, or encrypted storage with an external encryption key.

Prohibited:

- localStorage
- sessionStorage
- browser-readable secrets
- logging raw credentials
- returning stored secrets to clients
- normal application tables with plaintext credentials

## 6. Custom Endpoint Validation

Production requirements:

- HTTPS required
- URL parsed server-side
- Credentials in URL rejected
- Localhost and loopback rejected
- Private, link-local, and metadata-service IPs rejected
- DNS and redirect targets revalidated
- Timeout and response-size limits enforced

Local development may enable explicit local endpoints through a separate configuration flag.

## 7. Connection Test

```ts
interface ConnectionValidationResult {
  ok: boolean;
  latencyMs?: number;
  providerName?: string;
  discoveredModels?: string[];
  errorCode?: string;
  message?: string;
}
```

Provider errors must be sanitized before returning to the client.

## 8. Capability Verification

Before approval, verify as applicable:

- Basic generation
- Streaming
- Tool calling
- Structured output
- Required context capacity
- Vision input
- File input
- Reasoning mode
- Timeout behavior
- Rate-limit behavior

## 9. Fallback Policy

Fallback may occur for provider timeout, rate limit, temporary server error, or connection failure.

Do not automatically fallback for invalid prompts, tool validation failures, authentication failures, user cancellation, or deterministic application errors.

## 10. Observability

Log provider connection ID, model profile ID, agent ID, request ID, latency, retry count, fallback transition, and sanitized error category.

Never log API keys, authorization headers, or full prompts and responses by default.

---

<!-- Source: docs/AGENT_CONTRACT.md -->

# Aether Agent Contract

## 1. Purpose

This contract allows built-in agents, database-stored agents, and future team agents to appear consistently in Aether.

## 2. Agent Manifest

```ts
type AgentSource = 'code' | 'stored';
type AgentStatus = 'draft' | 'published' | 'archived';
type AgentCategory = 'qa' | 'research' | 'productivity' | 'social' | 'custom';

interface AgentManifest {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  source: AgentSource;
  status: AgentStatus;
  protected: boolean;
  capabilities: string[];
  toolIds: string[];
  modelBinding: {
    primaryModelProfileId: string;
    fallbackModelProfileIds: string[];
  };
  memory: {
    enabled: boolean;
    mode: 'thread' | 'resource-and-thread';
  };
  visibility: 'private' | 'internal' | 'public';
  createdAt: string;
  updatedAt: string;
}
```

## 3. ID Rules

Agent IDs must use lowercase letters, digits, and hyphens; match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; be unique; avoid reserved identifiers; and remain immutable.

Reserved initial IDs:

- `qa-web-agent`
- `qa-mobile-agent`

## 4. Built-In Agents

Built-in agents are code-defined, protected, not deletable through Agent Builder, assigned explicit tools, and bound to tested model profiles.

### QA Web Agent

```text
ID: qa-web-agent
Category: qa
Capabilities:
- browser-testing
- form-testing
- evidence-collection
- qa-reporting
```

### QA Mobile Agent

```text
ID: qa-mobile-agent
Category: qa
Capabilities:
- apk-inspection
- android-device-control
- maestro-testing
- screenshot-collection
- qa-reporting
```

## 5. Stored Agents

Stored agents:

- Are created through Agent Builder
- Begin as draft
- Are hidden until published
- Use approved model profiles and tools
- Can be archived
- Can be deleted only with confirmation
- Retain historical version metadata

## 6. Lifecycle

```text
Draft
  ├── Edit
  ├── Test
  └── Publish
        ├── Create a new draft version
        ├── Archive
        └── Remain available in Agent Catalog
```

Published configuration is immutable. Editing a published agent creates a new draft version.

## 7. Runtime Resolution

```ts
interface AgentResolver {
  get(agentId: string, version?: 'published' | string): Promise<ResolvedAgent>;
  listPublished(): Promise<AgentManifest[]>;
  listAllForAdmin(): Promise<AgentManifest[]>;
}
```

Normal chat uses published versions. Draft testing explicitly requests a draft version. Archived agents cannot start new normal conversations.

## 8. Conversation Binding

Every conversation has one immutable `agentId` after its first message. Selecting another agent creates another conversation. History does not automatically transfer across agents.

## 9. Tool Assignment

An agent can use only declared `toolIds`. The runtime validates existence, enablement, category approval, infrastructure health, and user permission where applicable.

## 10. Model Assignment

Agents store model-profile references, not raw provider credentials.

Built-in agents use developer-approved profiles and do not expose per-message model switching. Stored agents allow selection from approved profiles only.

## 11. Memory

Initial modes:

- `thread`: isolated by conversation
- `resource-and-thread`: optionally shared for the same user and agent with thread isolation

Cross-agent memory is outside the initial scope.

## 12. External Team Agent Integration

A contributed agent must provide:

1. Agent manifest
2. Runtime factory or stored definition
3. Tool requirements
4. Required environment variables
5. Validation instructions
6. Test instructions
7. Known limitations

It must not hardcode secrets, import web-app internals, read other agents' history directly, register undeclared global tools, or use undeclared provider connections.

## 13. Minimum Evaluation

Before publication:

- Basic response succeeds
- Instructions are followed
- Required tools work
- Output format is valid
- Errors are clear
- Model supports required capabilities
- No secret is exposed

---

<!-- Source: docs/TOOL_CONTRACT.md -->

# Aether Tool Contract

## 1. Purpose

Aether tools are reusable, schema-validated capabilities attached explicitly to agents.

## 2. Tool Manifest

```ts
type ToolRiskLevel = 'read' | 'interactive' | 'consequential' | 'system';

interface ToolManifest<Input, Output> {
  id: string;
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: unknown;
  outputSchema: unknown;
  requiresApproval: boolean;
  timeoutMs: number;
  capabilities: string[];
  execute(input: Input, context: ToolExecutionContext): Promise<Output>;
}
```

## 3. Tool Execution Context

```ts
interface ToolExecutionContext {
  requestId: string;
  userId: string;
  conversationId: string;
  agentId: string;
  signal: AbortSignal;
}
```

## 4. General Rules

Every tool must have a unique ID, validate input and output, enforce timeout, support cancellation where possible, return structured errors, avoid logging secrets, avoid arbitrary command execution, declare risk, and remain testable outside the LLM.

## 5. Error Contract

```ts
interface ToolErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

Stable codes include `INVALID_INPUT`, `NOT_CONFIGURED`, `TIMEOUT`, `NETWORK_ERROR`, `AUTH_REQUIRED`, `PERMISSION_DENIED`, `UNSUPPORTED_CONTENT`, `DEVICE_NOT_FOUND`, and `COMMAND_FAILED`.

## 6. Web Search Tool

### ID

```text
web_search
```

### Input

```ts
interface WebSearchInput {
  query: string;
  limit?: number;
  language?: string;
  categories?: string[];
  timeRange?: 'day' | 'month' | 'year';
}
```

### Output

```ts
interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  rank: number;
}

interface WebSearchOutput {
  query: string;
  results: WebSearchResult[];
  searchedAt: string;
}
```

Requirements: query SearXNG server-side, limit results, normalize and deduplicate, remove unsupported URL schemes, and use bounded retries.

## 7. Web Fetch Tool

### ID

```text
web_fetch
```

### Input

```ts
interface WebFetchInput {
  url: string;
  maxCharacters?: number;
}
```

### Output

```ts
interface WebFetchOutput {
  url: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  content: string;
  extractedAs: 'markdown' | 'text';
  retrievedAt: string;
  truncated: boolean;
}
```

Security requirements: HTTP/HTTPS only, reject credentials in URLs, reject loopback/private/link-local targets, revalidate DNS and redirects, limit response bytes, enforce timeout, validate content type, and sanitize extracted content.

## 8. Browser Tool Family

Suggested IDs:

```text
browser.navigate
browser.snapshot
browser.click
browser.type
browser.select
browser.press
browser.screenshot
browser.extract
```

Mutating actions may require approval. Sessions are scoped. Authentication state must not leak across users. Browser automation is for interaction and testing, not general web research.

## 9. Mobile Tool Family

Suggested IDs:

```text
mobile.check_environment
mobile.list_devices
mobile.inspect_apk
mobile.install_apk
mobile.launch_app
mobile.get_hierarchy
mobile.run_maestro_flow
mobile.take_screenshot
mobile.collect_logs
mobile.cleanup_session
```

No general shell tool is exposed. Commands use allowlisted executable and argument builders. APK paths remain in approved temporary directories. Device IDs come from detected devices. Runs use session IDs and defined artifact retention.

## 10. Approval Model

| Risk | Default |
|---|---|
| `read` | No approval |
| `interactive` | Configurable |
| `consequential` | Approval required |
| `system` | Approval required unless trusted local test mode |

## 11. Tool Registration

```ts
interface ToolRegistry {
  register(tool: ToolManifest<unknown, unknown>): void;
  get(id: string): ToolManifest<unknown, unknown>;
  list(): ToolManifest<unknown, unknown>[];
  listForAgent(agentId: string): ToolManifest<unknown, unknown>[];
}
```

The runtime never trusts tool IDs from the browser without authorization checks.

## 12. External Team Tool Integration

A contributed tool package includes manifest, schemas, implementation, environment requirements, health check where relevant, tests, README, security limitations, and example agent assignment.

---

<!-- Source: docs/ROADMAP.md -->

# Aether Development Roadmap

## Development Rules

1. Branch from `main`.
2. Use a dedicated branch.
3. Write or update the specification.
4. Implement and validate.
5. Push the branch.
6. Open a PR.
7. Assign Mas Gitgit as reviewer.
8. Fix every real review finding.
9. Merge only after approval.

## PR-0: Bootstrap Aether

Branch: `chore/bootstrap-aether`

### Scope

- npm workspace
- `apps/web`
- `apps/agent-server`
- shared TypeScript configuration
- lint and formatting
- environment validation
- Mastra server
- initial database
- CI for install, typecheck, lint, and build
- Docker Compose
- SearXNG infrastructure placeholder
- documentation
- base error and logging contracts

### Acceptance Criteria

- Fresh clone installs successfully.
- Web and agent server run locally.
- CI passes.
- No provider secret is committed.
- Structure follows architecture documentation.

## PR-1: Provider Registry

Branch: `feat/provider-registry`

### Scope

- Provider connection entity
- Model profile entity
- Agent model binding
- Native OpenAI adapter
- Native Anthropic adapter
- Native Google adapter
- OpenRouter adapter
- Custom OpenAI-compatible adapter
- Server-side secret abstraction
- Connection testing
- Capability metadata
- Admin provider UI
- Approved model list

### Acceptance Criteria

- A configured model from every provider type can generate a response.
- Credentials never return to the web client.
- Custom endpoint validation is enforced.
- Model profiles can be enabled, disabled, and approved.
- Provider health is visible.

## PR-2: Agent Catalog and Chat

Branch: `feat/agent-catalog-chat`

### Scope

- Agent Registry
- QA Web Agent registration
- Agent Catalog UI
- Conversation creation and persistence
- `agentId` binding
- Streaming
- Tool-event timeline
- Browser approval behavior
- Configurable default agent

### Acceptance Criteria

- Catalog lists QA Web Agent.
- User can chat with it.
- Conversation survives reload.
- Conversation cannot silently switch agents.
- Browser testing works.
- No generic `main-agent` is required.

## PR-3: Agent Builder

Branch: `feat/agent-builder`

### Scope

- Database-backed stored agents
- CRUD, archive, and delete
- Draft and publish lifecycle
- Model-profile selection
- Tool selection
- Memory configuration
- Draft testing
- Protected built-in agents
- Published agents in catalog

### Acceptance Criteria

- User can create and publish an agent.
- Published agent works in chat.
- Agent survives backend restart.
- Protected agents cannot be deleted.
- Invalid tool and model references are rejected.
- Historical conversations survive archival.

## PR-4: Web Search and Web Fetch

Branch: `feat/web-research-tools`

### Scope

- Managed SearXNG configuration
- `web_search`
- `web_fetch`
- Normalization and extraction
- SSRF protection
- Timeouts and size limits
- Tests
- Tool registration and assignment

### Acceptance Criteria

- Search returns normalized results.
- Fetch extracts readable content.
- Private and loopback targets are blocked.
- Redirects are revalidated.
- Agent can combine search and fetch.
- Errors are structured.

## PR-5: QA Mobile with Maestro

Branch: `feat/qa-mobile-maestro`

### Scope

- QA Mobile Agent
- APK upload and inspection
- ADB environment check
- Device selection
- APK install and launch
- Maestro YAML generation
- Maestro execution
- Screenshots and logs
- QA report
- Cleanup

### Acceptance Criteria

- Valid APK can be uploaded.
- Package ID is detected.
- Connected device is detected.
- APK installs and launches.
- Maestro flow runs.
- Results and screenshots display.
- No arbitrary shell execution is exposed.

## External Integration Backlog

These are not implemented by Fikri initially but must be supported through contracts:

- PM Agent
- Social Media Agent
- Telegram or Discord channel
- Time Tools
- Email Outbound Tools
- Google Drive Connector
- OCR integration

## Later Backlog

- Supervisor Agent
- Multi-agent delegation
- Organization and role management
- Agent evaluation dashboard
- Full audit log UI
- Rate and cost limits
- Production secret-manager integration
- Deployment automation
- Multi-device mobile testing

---

<!-- Source: docs/DECISIONS.md -->

# Aether Architectural Decisions

## ADR-001: Rename the Application to Aether

**Status:** Accepted

The rebuilt application is named **Aether**. The old Chekku repository remains a prototype and reference implementation unless the team decides otherwise.

## ADR-002: Rebuild on a Fresh Repository

**Status:** Accepted

The product changed from one browser agent to an agent gateway. Fresh contracts are needed for agents, providers, tools, and conversations. The old repository should not be deleted because it still contains useful validated behavior.

## ADR-003: Scope Only Fikri's Workstream

**Status:** Accepted

Included: gateway foundation, Agent Builder, multi-provider support, QA Web, Web Search, Web Fetch, QA Mobile, and integration contracts.

Excluded initially: PM Agent, Social Media Agent, channels, Time Tool, Email Tool, Google Drive, and OCR.

## ADR-004: Agent Builder Is Not an Agent

**Status:** Accepted

Agent Builder belongs to the control plane and directly manages stored agent definitions. No `agent-builder-agent` is required.

## ADR-005: No Generic Main Agent

**Status:** Accepted

The initial catalog contains clearly named specialized agents. A configurable default may exist, but no ambiguous `main-agent` identity is required.

## ADR-006: Direct Agent Selection Before Supervisor

**Status:** Accepted

The initial version uses direct agent selection. Supervisor routing is deferred until specialized agents and their contracts are stable.

## ADR-007: Multi-Provider with Controlled Model Selection

**Status:** Accepted

Aether supports multiple providers. Built-in agents use tested model bindings. Stored-agent creators select from approved profiles. End users do not freely replace models per message.

## ADR-008: Native Providers Plus Custom Gateway

**Status:** Accepted

Use native integrations for OpenAI, Anthropic, and Google. Use OpenRouter as a gateway. Use custom OpenAI-compatible gateway support for Rafiq and approved endpoints.

## ADR-009: Server-Side Secret Handling

**Status:** Accepted

API keys are not stored in localStorage or sessionStorage. The browser works with provider-connection and model-profile IDs.

## ADR-010: Conversation History Is Agent-Scoped

**Status:** Accepted

Each conversation belongs to one agent. Switching agents creates or opens another conversation.

## ADR-011: Search and Fetch Are Separate Tools

**Status:** Accepted

SearXNG performs search discovery. `web_fetch` retrieves and extracts content. Browser automation remains for interaction and testing.

## ADR-012: Mobile Tools Use Allowlists

**Status:** Accepted

The LLM cannot execute arbitrary shell commands. ADB and Maestro operations are exposed through explicit safe wrappers.
