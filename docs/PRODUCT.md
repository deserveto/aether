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
