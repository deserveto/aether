# AGENTS.md

Guidance for OpenCode sessions working in this repo.

## Repo state

This repository has the **PR-0 foundation** in place: npm workspaces (`apps/web`, `apps/agent-server`, `packages/shared`), TypeScript strict, ESLint flat config, Prettier, Vitest, GitHub Actions CI, and a SearXNG docker-compose placeholder. Provider/agent/tool packages arrive in later PRs.

- Build/test/lint/typecheck/format commands exist at the workspace root — run them from there.
- Do not invent commands. If asked to run something, check first; if missing, say so.
- The remaining planned packages (`packages/agents`, `packages/agent-builder`, `packages/providers`, `packages/tools`, `packages/database`) are **not yet present**; the docs describe the target tree.

`AETHER_FOUNDATION.md` is a concatenation of `README.md` + all `docs/*.md` files (visible `<!-- Source: ... -->` markers). Edit the source files under `docs/` and `README.md`; treat `AETHER_FOUNDATION.md` as generated unless told otherwise.

## Authoritative specs

Before implementing anything, read the relevant doc. These are contracts, not aspirations:

- `docs/ARCHITECTURE.md` — component layout, monorepo structure, dependency rules, request flows
- `docs/PRODUCT.md` — scope, non-goals, functional requirements
- `docs/AGENT_CONTRACT.md` — agent manifest, ID rules, lifecycle, reserved IDs
- `docs/PROVIDER_CONTRACT.md` — provider/model/binding entities, adapter interface, secret rules
- `docs/TOOL_CONTRACT.md` — tool manifest, risk levels, approval model
- `docs/ROADMAP.md` — PR sequence, branch names, reviewer
- `docs/DECISIONS.md` — ADRs; do not contradict accepted decisions without flagging

## Workflow (from ROADMAP.md)

1. Branch from `main` into a dedicated branch.
2. Branch names are fixed per PR in `docs/ROADMAP.md` (e.g. `chore/bootstrap-aether`, `feat/provider-registry`). Use the documented name.
3. Open a PR. **Reviewer: Mas Gitgit.** Fix every real finding before merge.
4. PRs land in order PR-0 → PR-5. Do not skip ahead.

## Hard constraints (easy to violate by accident)

- **No generic `main-agent`.** Catalog lists named specialized agents. A configurable default agent is allowed; an ambiguous `main-agent` identity is not (ADR-005).
- **Agent Builder is control-plane, not an agent.** No `agent-builder-agent` (ADR-004).
- **Agent IDs**: lowercase kebab-case matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`, unique, immutable, and must not reuse reserved IDs (`qa-web-agent`, `qa-mobile-agent`).
- **`agentId` is immutable** on a conversation after the first message. Switching agents means a new conversation.
- **Secrets never reach the browser.** No localStorage / sessionStorage / API responses with raw credentials. The web app works with provider-connection and model-profile IDs only (ADR-009).
- **Custom provider endpoints**: HTTPS only in production; reject loopback / private / link-local / metadata IPs; revalidate DNS and redirects. Local dev may bypass via an explicit flag.
- **Mobile tools use allowlists only.** Never expose arbitrary shell to the LLM (ADR-012). ADB and Maestro run behind safe wrappers.
- **Search ≠ Fetch.** `web_search` (SearXNG discovery) and `web_fetch` (retrieval + extraction) are separate tools (ADR-011). Browser automation is for interaction/testing, not research.

## Dependency rules (ARCHITECTURE.md §4)

```
apps/web            → shared types + typed API client only
apps/agent-server   → agents, agent-builder, providers, tools, database, shared
packages/agents     → provider + tool interfaces, shared
packages/tools      → shared + external SDKs
packages/providers  → shared + provider SDKs
packages/database   → shared
```

Disallowed: provider packages importing UI; tool packages importing agent implementations; `shared` importing app code; web importing provider secrets; agents querying storage directly outside services. **No circular package dependencies.**

## Toolchain (verified in PR-0)

- npm workspaces, TypeScript monorepo
- Agent server hosts **Mastra** (`apps/agent-server/src/mastra/`)
- Local DB: **LibSQL**; local **SearXNG** via `infra/docker-compose.yml`
- Mobile QA: **Maestro CLI + ADB**, Android only, one device per run
- Providers: native OpenAI / Anthropic / Google, OpenRouter as gateway, custom OpenAI-compatible for Rafiq

## Notes

- PR-0 has landed. Trust the executable source (package.json, tsconfig, scripts, `src/`) over doc descriptions; if docs conflict with later config or scripts, the executable source wins.
