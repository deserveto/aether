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
