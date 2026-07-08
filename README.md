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
