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
