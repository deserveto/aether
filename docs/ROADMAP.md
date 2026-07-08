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
