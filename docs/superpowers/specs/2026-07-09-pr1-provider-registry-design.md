# Aether PR-1: Provider Registry Design Spec

## 1. Metadata

* **Status**: Approved
* **Date**: 2026-07-09
* **Branch**: `feat/provider-registry`
* **Reviewer**: Mas Gitgit

---

## 2. Overview & Goal

The purpose of the Provider Registry is to isolate provider credentials and model routing logic from individual agents. Agents will declare their model requirements via bindings to abstract **Model Profiles**, which are linked to server-managed **Provider Connections**. Raw API credentials never reach the browser client.

---

## 3. Directory Layout

The following directories and files will be introduced in this PR:

```text
packages/
├── database/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        # Exports DB client & helper initialization
│       └── schema.ts       # Drizzle schema definitions
└── providers/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts        # Exports adapters & security helpers
        ├── types.ts        # Shared types
        ├── security/
        │   ├── encryption.ts   # AES-256-GCM secret manager
        │   └── ssrf.ts         # Base URL and IP range checking
        └── adapters/
            ├── index.ts
            ├── base.ts         # Base adapter type/class
            ├── openai.ts       # Native OpenAI adapter
            ├── anthropic.ts    # Native Anthropic adapter
            ├── google.ts       # Native Google adapter
            ├── openrouter.ts   # OpenRouter adapter
            └── compatible.ts   # Custom OpenAI-compatible adapter

apps/
├── agent-server/
│   └── src/
│       └── mastra/
│           └── routes/
│               └── providers.ts  # Express/Mastra routes for connection/profile CRUD
└── web/
    └── src/
        └── features/
            └── providers/
                ├── components/   # UI components (forms, tables, test button)
                └── index.tsx     # Main settings page view
```

---

## 4. Database Schema (`packages/database/src/schema.ts`)

We define four primary tables in SQLite:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Secrets Table
export const aetherSecrets = sqliteTable('aether_secrets', {
  id: text('id').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 2. Provider Connections
export const providerConnections = sqliteTable('provider_connections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'>().notNull(),
  baseUrl: text('base_url'),
  secretRef: text('secret_ref').notNull(), // points to aetherSecrets.id or "env:VAR_NAME"
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  status: text('status').$type<'untested' | 'healthy' | 'degraded' | 'unavailable'>().default('untested').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 3. Model Profiles
export const modelProfiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  providerConnectionId: text('provider_connection_id')
    .references(() => providerConnections.id, { onDelete: 'cascade' })
    .notNull(),
  modelId: text('model_id').notNull(),
  displayName: text('display_name').notNull(),
  capabilities: text('capabilities').notNull(), // Stringified JSON: { streaming, toolCalling, structuredOutput, vision, fileInput, reasoning }
  approved: integer('approved', { mode: 'boolean' }).default(false).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  defaultSettings: text('default_settings'), // Stringified JSON: { temperature, maxOutputTokens }
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 4. Agent Model Bindings
export const agentModelBindings = sqliteTable('agent_model_bindings', {
  agentId: text('agent_id').primaryKey(),
  primaryModelProfileId: text('primary_model_profile_id')
    .references(() => modelProfiles.id, { onDelete: 'restrict' })
    .notNull(),
  fallbackModelProfileIds: text('fallback_model_profile_ids').notNull(), // Stringified JSON array of IDs
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
```

To avoid friction, when the server starts, it will verify/initialize these tables if they do not exist.

---

## 5. Security & Secret Abstraction

### 5.1 Credential Encryption (`packages/providers/src/security/encryption.ts`)
* **Encryption**: Uses Node `crypto`'s `aes-256-gcm`.
* **Key Source**: Derived from `ENCRYPTION_KEY` environment variable.
* **Fallback**: Supports `env:KEY_NAME` to bypass table lookup and retrieve directly from `process.env`.
* **Prohibited**: Plaintext keys are never stored in databases, logs, or sent to clients.

### 5.2 SSRF Protection (`packages/providers/src/security/ssrf.ts`)
For custom endpoints:
* **Protocol**: Enforce `https:` in production (`NODE_ENV === 'production'`).
* **Credentials**: Reject URLs containing credentials (e.g. `https://username:password@domain`).
* **IP Check**:
  - Resolve the hostname to IPs using native Node `dns.resolve`.
  - Use `ipaddr.js` to block loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), link-local (`169.254.0.0/16`, `fe80::/10`), and cloud metadata (`169.254.169.254`).
  - Allow local IPs only if `ALLOW_LOCAL_ENDPOINTS=true`.
* **Fetch Hardening**:
  - Timeout limit: 5 seconds.
  - Size limit: 5MB.
  - Redirect validation: Re-resolve target DNS and IP at every redirect hop.

---

## 6. Adapter Architecture

Each provider has a native adapter implementing:
1. `validateConnection(...)`: Checks connection validity via a cheap test request.
2. `listModels(...)`: Fetches list of models from the provider endpoint.
3. `resolveModel(...)`: Returns a configured `LanguageModelV1` for Mastra agents.
4. `healthCheck(...)`: Tests server latency and status.

Adapters:
* **OpenAI**: Uses `@ai-sdk/openai` natively.
* **Anthropic**: Uses `@ai-sdk/anthropic` natively.
* **Google**: Uses `@ai-sdk/google` natively.
* **OpenRouter**: Uses `@ai-sdk/openai` configured with OpenRouter base URL and headers.
* **Custom compatible**: Uses `@ai-sdk/openai` with validated custom base URL, headers, and strict SSRF revalidation.

---

## 7. Server API Route Definitions (`apps/agent-server/src/mastra/routes/providers.ts`)

* `GET /api/providers/connections`
* `POST /api/providers/connections`
* `PUT /api/providers/connections/:id`
* `DELETE /api/providers/connections/:id`
* `POST /api/providers/connections/test`
* `GET /api/providers/models/discovered?connectionId=...`
* `GET /api/providers/models/profiles`
* `POST /api/providers/models/profiles`
* `PATCH /api/providers/models/profiles/:id`
* `GET /api/providers/bindings`
* `POST /api/providers/bindings`

---

## 8. Web Settings UI

* **Style**: Minimalist & Swiss Style. Black, white, grey, and beige accents. Strict visual density.
* **Features**:
  1. Connection creation and listing.
  2. Connection test feedback (showing green/red badge and latency in ms).
  3. Model discovery: Fetches discovered models, lets admin approve a model, configure display name, capabilities list, and defaults.
  4. Agent Bindings dropdown.

---

## 9. Verification & Testing

* **Unit tests**:
  - Encryption and decryption utility.
  - SSRF checker (blocking private/loopback, allowing under dev flag).
  - Connection parsing and secret resolution.
* **Integration test**:
  - Instantiating models and checking simple generation capability across mock connections.
* **CLI Validation**:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
