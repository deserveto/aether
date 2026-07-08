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

| Agent ID          | Name            | Purpose                                            |
| ----------------- | --------------- | -------------------------------------------------- |
| `qa-web-agent`    | QA Web Agent    | Browser-based web application testing              |
| `qa-mobile-agent` | QA Mobile Agent | Android APK testing through Maestro                |
| Stored agent IDs  | Custom Agents   | Agents created and published through Agent Builder |

There is no ambiguous generic `main-agent` in the fresh architecture. The landing page should display the Agent Catalog. A configurable default agent may be set through environment configuration.

## Initial Tools

| Tool ID      | Purpose                                                 |
| ------------ | ------------------------------------------------------- |
| `browser.*`  | Browser automation and web QA                           |
| `web_search` | Search through a managed SearXNG instance               |
| `web_fetch`  | Fetch and extract readable web content                  |
| `mobile.*`   | Inspect APKs, manage devices, and execute Maestro flows |

## Current state

This repository has the **PR-0 foundation** in place: an npm-workspaces monorepo with a Next.js web shell and a Mastra agent server. Product features (Agent Catalog, chat, providers, tools, QA agents) arrive in subsequent pull requests. See `docs/ROADMAP.md` for the full sequence.

## Prerequisites

| Tool    | Version                          | Required                        |
| ------- | -------------------------------- | ------------------------------- |
| Node.js | >= 22.13 (22.18 LTS recommended) | yes                             |
| npm     | >= 10 (bundled with Node)        | yes                             |
| Docker  | any recent version               | optional (SearXNG in PR-4 only) |

## Quick start

```bash
git clone https://github.com/deserveto/aether.git
cd aether
cp apps/agent-server/.env.example apps/agent-server/.env
npm install
npm run dev
```

Create `apps/web/.env.local` with:

```text
NEXT_PUBLIC_AGENT_SERVER_URL=http://localhost:4111
```

`npm run dev` starts both apps concurrently:

- **Web** — http://localhost:3000
- **Agent server (Mastra)** — http://localhost:4111

Verify the agent server:

```bash
curl http://localhost:4111/healthz
```

Expected: HTTP 200 JSON with `status: "ok"`, `service`, `version`, `timestamp`.

## Environment

All values are placeholders. **No provider API keys live in this repository.**

### Agent server (`apps/agent-server/.env`)

Validated by `apps/agent-server/src/config/env.ts` (Zod):

| Variable                | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`              | `development` / `test` / `production`                               |
| `PORT`                  | Mastra bind port (default `4111`)                                   |
| `HOST`                  | Mastra bind host (default `localhost`)                              |
| `DATABASE_URL`          | LibSQL file URL, e.g. `file:./mastra.db`                            |
| `LOG_LEVEL`             | pino level: `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `WEB_URL`               | Web origin allowed by CORS                                          |
| `ALLOW_LOCAL_ENDPOINTS` | Custom-endpoint dev bypass (`true`/`false`); consumed in PR-1       |

### Web (`apps/web/.env.local`)

Validated by `apps/web/src/env.ts` (Zod):

| Variable                       | Description                               |
| ------------------------------ | ----------------------------------------- |
| `NODE_ENV`                     | `development` / `test` / `production`     |
| `NEXT_PUBLIC_AGENT_SERVER_URL` | Agent-server base URL used by the browser |

### Root reference (`.env.example`)

A root `.env.example` lists all variables across apps for reference, plus `SEARXNG_URL` (placeholder consumed in PR-4). It is documentation only; each app validates its own subset.

## Development commands

| Command                | Effect                                       |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start web + agent-server concurrently        |
| `npm run dev:web`      | Start web only                               |
| `npm run dev:agent`    | Start agent server only                      |
| `npm run build`        | Build web and agent-server                   |
| `npm run typecheck`    | Per-workspace `tsc --noEmit` |
| `npm run lint`         | ESLint across the workspace                  |
| `npm run test`         | Vitest across all `__tests__`                |
| `npm run format`       | Prettier write                               |
| `npm run format:check` | Prettier check (CI-equivalent)               |

## Repository structure

Current (PR-0):

```text
aether/
├── apps/
│   ├── web/              # Next.js 16 — Swiss-style shell + health badge
│   └── agent-server/     # Mastra — zero agents, /healthz, LibSQL storage
├── packages/
│   └── shared/           # @aether/shared — errors, health, env, log types
├── infra/
│   └── searxng/          # docker-compose placeholder (PR-4)
├── docs/                 # product, architecture, contracts, roadmap, decisions, design
├── .github/workflows/    # CI
└── (root tooling)
```

Planned (later PRs): `packages/agents`, `packages/agent-builder`, `packages/providers`, `packages/tools`, `packages/database`. They are created when they have real content — not as empty placeholders. See `docs/ARCHITECTURE.md` for the target tree.

## Implementation status (PR-0)

- npm workspaces monorepo with TypeScript strict, ESLint flat config, Prettier, Vitest.
- `apps/web`: Next.js 16 App Router, Swiss-style shell, health badge polling `/healthz`.
- `apps/agent-server`: Mastra native server on port 4111, LibSQL file storage, `/healthz` route, **zero agents registered**, native `server.cors` with explicit `WEB_URL` allowlist, pino HTTP logging plus Mastra `ConsoleLogger`.
- `packages/shared`: `AppError`, `HealthResponse`, env and log-context types.
- CI runs lint, typecheck, test, build on every push and PR.
- SearXNG docker-compose placeholder for PR-4.
- Tests: 13 passing (shared errors + agent-server env, including `ALLOW_LOCAL_ENDPOINTS` semantics).

Note: Aether's canonical health route is `/healthz`, which returns `{ status, service, version, timestamp }`. Mastra also ships a built-in `/health` returning `{"success":true}`; do not use it as Aether's health check.

## Not implemented yet

The following are explicitly out of scope for PR-0 and arrive in later pull requests:

- Provider Registry and provider administration UI (PR-1)
- Agent Catalog and chat (PR-2)
- Agent Builder (PR-3)
- Web Search and Web Fetch tools (PR-4)
- QA Mobile with Maestro (PR-5)
- Supervisor Agent, PM Agent, Social Media Agent
- Telegram, Discord, Email Tool, Google Drive, OCR
- Streaming chat, tool execution, conversation persistence beyond storage initialization

## Architecture & contracts

Read `docs/` for the authoritative product, architecture, provider, agent, tool, roadmap, decision, and design references.
