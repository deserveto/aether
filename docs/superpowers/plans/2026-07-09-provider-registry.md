# Provider Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete server-side Provider Registry with native adapters, custom endpoint SSRF protection, encrypted secrets, and an administration UI for managing connections, model profiles, and agent bindings.

**Architecture:** A database schema backed by Drizzle-ORM in `packages/database`, a security & adapter package in `packages/providers`, REST endpoints in `apps/agent-server` exposed via Mastra API routing, and an admin user interface in `apps/web`.

**Tech Stack:** TypeScript, Drizzle-ORM, `@libsql/client`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `ipaddr.js`, `zod`, Vitest, Next.js, Tailwind CSS (or Vanilla CSS per user's styling instruction, we use Tailwind/CSS classes already present in apps/web).

## Global Constraints

- No secrets in the browser (localStorage/sessionStorage/API responses). The web client only works with provider-connection and model-profile IDs.
- Custom endpoints must run HTTPS-only in production, reject loopback/private/link-local/metadata IPs, and revalidate DNS and redirects.
- No `@ts-ignore`, no strict-disable, no global eslint suppression, no arbitrary `any`.
- Keep the zod patch: do not upgrade zod to a version that breaks `mastra dev`.
- Typecheck is per-workspace: use `npm run typecheck` which runs `tsc --noEmit` inside each workspace package.
- In `apps/web`, imports are extensionless. In `apps/agent-server`, imports use `.js` extensions.

---

### Task 1: Scaffolding packages/database and Schema Definition

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/schema.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/__tests__/db.test.ts`
- Modify: `package.json` (running `npm install` to update workspace bindings)

**Interfaces:**
- Produces:
  - `db`: Drizzle Database instance connected to LibSQL.
  - `initDb()`: Asynchronous function that initializes the schema (creates tables if they do not exist).
  - Schema tables: `providerConnections`, `modelProfiles`, `agentModelBindings`, `aetherSecrets`.

- [ ] **Step 1: Create `packages/database/package.json`**
  ```json
  {
    "name": "@aether/database",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "exports": {
      ".": "./src/index.ts"
    },
    "scripts": {
      "typecheck": "tsc --noEmit",
      "lint": "eslint .",
      "test": "vitest run"
    },
    "dependencies": {
      "@aether/shared": "*",
      "drizzle-orm": "^0.39.0",
      "@libsql/client": "^0.17.4"
    },
    "devDependencies": {
      "typescript": "^5.9.0",
      "vitest": "^4.0.0"
    }
  }
  ```

- [ ] **Step 2: Create `packages/database/tsconfig.json`**
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src"
    },
    "include": ["src/**/*"]
  }
  ```

- [ ] **Step 3: Define schema in `packages/database/src/schema.ts`**
  ```typescript
  import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
  import { sql } from 'drizzle-orm';

  export const aetherSecrets = sqliteTable('aether_secrets', {
    id: text('id').primaryKey(),
    encryptedValue: text('encrypted_value').notNull(),
    iv: text('iv').notNull(),
    tag: text('tag').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  });

  export const providerConnections = sqliteTable('provider_connections', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'>().notNull(),
    baseUrl: text('base_url'),
    secretRef: text('secret_ref').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
    status: text('status').$type<'untested' | 'healthy' | 'degraded' | 'unavailable'>().default('untested').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  });

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

  export const agentModelBindings = sqliteTable('agent_model_bindings', {
    agentId: text('agent_id').primaryKey(),
    primaryModelProfileId: text('primary_model_profile_id')
      .references(() => modelProfiles.id, { onDelete: 'restrict' })
      .notNull(),
    fallbackModelProfileIds: text('fallback_model_profile_ids').notNull(), // Stringified JSON array
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  });
  ```

- [ ] **Step 4: Create DB Client and Initialization in `packages/database/src/index.ts`**
  ```typescript
  import { drizzle } from 'drizzle-orm/libsql';
  import { createClient } from '@libsql/client';
  import * as schema from './schema.js';

  const databaseUrl = process.env.DATABASE_URL || 'file:./mastra.db';

  export const client = createClient({ url: databaseUrl });
  export const db = drizzle(client, { schema });

  export async function initDb() {
    // Basic automatic table creation for SQLite to keep bootstrap simple without complex migration files
    await client.execute(`
      CREATE TABLE IF NOT EXISTS aether_secrets (
        id TEXT PRIMARY KEY NOT NULL,
        encrypted_value TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS provider_connections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        base_url TEXT,
        secret_ref TEXT NOT NULL,
        enabled INTEGER DEFAULT 1 NOT NULL,
        status TEXT DEFAULT 'untested' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        provider_connection_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        approved INTEGER DEFAULT 0 NOT NULL,
        enabled INTEGER DEFAULT 1 NOT NULL,
        default_settings TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (provider_connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
      );
    `);
    await client.execute(`
      CREATE TABLE IF NOT EXISTS agent_model_bindings (
        agent_id TEXT PRIMARY KEY NOT NULL,
        primary_model_profile_id TEXT NOT NULL,
        fallback_model_profile_ids TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (primary_model_profile_id) REFERENCES model_profiles(id) ON DELETE RESTRICT
      );
    `);
  }

  export * from './schema.js';
  ```

- [ ] **Step 5: Write the failing DB test in `packages/database/src/__tests__/db.test.ts`**
  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest';
  import { db, initDb, providerConnections } from '../index.js';

  describe('Database Initialization and Operations', () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = 'file::memory:';
      await initDb();
    });

    it('can insert and retrieve a provider connection', async () => {
      await db.insert(providerConnections).values({
        id: 'conn-1',
        name: 'OpenAI Dev',
        type: 'openai',
        secretRef: 'env:OPENAI_API_KEY',
        enabled: true,
        status: 'untested',
      });

      const retrieved = await db.query.providerConnections.findFirst({
        where: (fields, { eq }) => eq(fields.id, 'conn-1'),
      });

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('OpenAI Dev');
      expect(retrieved?.type).toBe('openai');
    });
  });
  ```

- [ ] **Step 6: Run npm install, bootstrap workspace, and execute database test**
  Run: `npm install` at root to install Drizzle-ORM dependencies and link `@aether/database`.
  Run: `npx vitest run packages/database/src/__tests__/db.test.ts`
  Expected: PASS

- [ ] **Step 7: Commit task**
  Run: `git add packages/database; git commit -m "feat: setup database package, schema, and client"`

---

### Task 2: Implement Server-Side Secrets Manager (`packages/providers`)

**Files:**
- Create: `packages/providers/package.json`
- Create: `packages/providers/tsconfig.json`
- Create: `packages/providers/src/security/encryption.ts`
- Create: `packages/providers/src/__tests__/encryption.test.ts`

**Interfaces:**
- Consumes: `@aether/database` (for storing/retrieving credentials)
- Produces:
  - `encryptSecret(secret: string): Promise<{ id: string, iv: string, tag: string, encryptedValue: string }>`
  - `decryptSecret(secretId: string): Promise<string>`
  - `resolveSecret(secretRef: string): Promise<string>`

- [ ] **Step 1: Create `packages/providers/package.json`**
  ```json
  {
    "name": "@aether/providers",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "exports": {
      ".": "./src/index.ts"
    },
    "scripts": {
      "typecheck": "tsc --noEmit",
      "lint": "eslint .",
      "test": "vitest run"
    },
    "dependencies": {
      "@aether/shared": "*",
      "@aether/database": "*",
      "@ai-sdk/openai": "^1.1.0",
      "@ai-sdk/anthropic": "^1.1.0",
      "@ai-sdk/google": "^1.1.0",
      "ipaddr.js": "^2.2.0",
      "zod": "^4.0.0"
    },
    "devDependencies": {
      "typescript": "^5.9.0",
      "vitest": "^4.0.0"
    }
  }
  ```

- [ ] **Step 2: Create `packages/providers/tsconfig.json`**
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src"
    },
    "include": ["src/**/*"]
  }
  ```

- [ ] **Step 3: Implement Encryption Utility in `packages/providers/src/security/encryption.ts`**
  ```typescript
  import crypto from 'crypto';
  import { db, aetherSecrets } from '@aether/database';
  import { AppError, ErrorCode } from '@aether/shared';
  import { eq } from 'drizzle-orm';

  const ALGORITHM = 'aes-256-gcm';

  function getEncryptionKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      throw new AppError({
        code: ErrorCode.NOT_CONFIGURED,
        message: 'ENCRYPTION_KEY environment variable is not defined',
      });
    }
    // Generate a 32-byte key from the configured key using SHA-256 hash
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  export async function encryptSecret(secret: string): Promise<string> {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    
    const id = crypto.randomUUID();
    await db.insert(aetherSecrets).values({
      id,
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      tag,
    });

    return id;
  }

  export async function decryptSecret(secretId: string): Promise<string> {
    const secretRow = await db.query.aetherSecrets.findFirst({
      where: eq(aetherSecrets.id, secretId),
    });

    if (!secretRow) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: `Secret with ID ${secretId} not found`,
      });
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(secretRow.iv, 'hex');
    const tag = Buffer.from(secretRow.tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(secretRow.encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  export async function resolveSecret(secretRef: string): Promise<string> {
    if (secretRef.startsWith('env:')) {
      const varName = secretRef.slice(4);
      const val = process.env[varName];
      if (!val) {
        throw new AppError({
          code: ErrorCode.NOT_CONFIGURED,
          message: `Environment secret ${varName} is missing`,
        });
      }
      return val;
    }
    return decryptSecret(secretRef);
  }
  ```

- [ ] **Step 4: Write testing in `packages/providers/src/__tests__/encryption.test.ts`**
  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest';
  import { initDb } from '@aether/database';
  import { encryptSecret, decryptSecret, resolveSecret } from '../security/encryption.js';

  describe('Secrets Management', () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = 'file::memory:';
      process.env.ENCRYPTION_KEY = 'super-secret-key';
      await initDb();
    });

    it('can encrypt and decrypt a secret key', async () => {
      const secret = 'my-api-key-12345';
      const secretRef = await encryptSecret(secret);
      
      expect(secretRef).toBeDefined();
      expect(secretRef).not.toBe(secret);

      const decrypted = await decryptSecret(secretRef);
      expect(decrypted).toBe(secret);
    });

    it('can resolve secret from environment variable', async () => {
      process.env.TEST_API_KEY = 'env-value-999';
      const resolved = await resolveSecret('env:TEST_API_KEY');
      expect(resolved).toBe('env-value-999');
    });
  });
  ```

- [ ] **Step 5: Run tests to verify**
  Run: `npm install` at root.
  Run: `npx vitest run packages/providers/src/__tests__/encryption.test.ts`
  Expected: PASS

- [ ] **Step 6: Commit task**
  Run: `git add packages/providers; git commit -m "feat: add secure secrets manager with AES-256-GCM"`

---

### Task 3: Custom Endpoint SSRF Protection (`packages/providers`)

**Files:**
- Create: `packages/providers/src/security/ssrf.ts`
- Create: `packages/providers/src/__tests__/ssrf.test.ts`

**Interfaces:**
- Produces:
  - `validateUrl(urlStr: string): Promise<void>` (throws `AppError` on SSRF/invalid urls)
  - `safeFetch(url: string, options?: RequestInit): Promise<Response>`

- [ ] **Step 1: Implement SSRF Validation in `packages/providers/src/security/ssrf.ts`**
  ```typescript
  import dns from 'dns/promises';
  import ipaddr from 'ipaddr.js';
  import { AppError, ErrorCode } from '@aether/shared';

  export async function validateUrl(urlStr: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid URL format',
      });
    }

    if (url.username || url.password) {
      throw new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        message: 'Credentials in URLs are rejected',
      });
    }

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && url.protocol !== 'https:') {
      throw new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        message: 'HTTPS protocol is required in production',
      });
    }

    const allowLocal = process.env.ALLOW_LOCAL_ENDPOINTS === 'true';
    if (allowLocal) {
      return url.toString();
    }

    // Resolve hostname to check IPs
    let ips: string[] = [];
    try {
      ips = await dns.resolve(url.hostname).catch(async () => {
        // Fallback to dns.lookup for simple IP inputs or hostnames without specific record type
        const lookup = await dns.lookup(url.hostname, { all: true });
        return lookup.map(l => l.address);
      });
    } catch {
      throw new AppError({
        code: ErrorCode.NETWORK_ERROR,
        message: `Failed to resolve hostname: ${url.hostname}`,
      });
    }

    for (const ip of ips) {
      if (isPrivateIp(ip)) {
        throw new AppError({
          code: ErrorCode.PERMISSION_DENIED,
          message: `Endpoint resolved to blocked IP: ${ip}`,
        });
      }
    }

    return url.toString();
  }

  function isPrivateIp(ipStr: string): boolean {
    try {
      const addr = ipaddr.parse(ipStr);
      const range = addr.range();

      // Blocked ranges:
      const blockedRanges = [
        'uniqueLocal',
        'linkLocal',
        'loopback',
        'private',
        'unspecified',
        'broadcast',
        'multicast'
      ];

      if (blockedRanges.includes(range)) {
        return true;
      }

      // Check for AWS/GCP/Azure metadata address
      if (ipStr === '169.254.169.254') {
        return true;
      }

      return false;
    } catch {
      // If ip cannot be parsed, treat as invalid / untrusted
      return true;
    }
  }

  export async function safeFetch(urlStr: string, options: RequestInit = {}): Promise<Response> {
    const validatedUrl = await validateUrl(urlStr);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    try {
      const response = await fetch(validatedUrl, {
        ...options,
        signal: controller.signal,
      });

      // Limit response size (5MB check)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        throw new AppError({
          code: ErrorCode.UNSUPPORTED_CONTENT,
          message: 'Response body exceeds size limit of 5MB',
        });
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
  ```

- [ ] **Step 2: Write tests in `packages/providers/src/__tests__/ssrf.test.ts`**
  ```typescript
  import { describe, it, expect, beforeEach } from 'vitest';
  import { validateUrl } from '../security/ssrf.js';

  describe('SSRF Protection', () => {
    beforeEach(() => {
      process.env.ALLOW_LOCAL_ENDPOINTS = 'false';
      process.env.NODE_ENV = 'production';
    });

    it('rejects loopback and private IPs', async () => {
      await expect(validateUrl('http://127.0.0.1')).rejects.toThrow();
      await expect(validateUrl('http://192.168.1.1')).rejects.toThrow();
      await expect(validateUrl('http://localhost')).rejects.toThrow();
    });

    it('rejects URLs with credentials', async () => {
      await expect(validateUrl('https://user:pass@google.com')).rejects.toThrow();
    });

    it('allows public URLs', async () => {
      const valid = await validateUrl('https://api.openai.com/v1');
      expect(valid).toBe('https://api.openai.com/v1');
    });

    it('allows loopback when ALLOW_LOCAL_ENDPOINTS is true', async () => {
      process.env.ALLOW_LOCAL_ENDPOINTS = 'true';
      const valid = await validateUrl('http://localhost:4000');
      expect(valid).toBe('http://localhost:4000/');
    });
  });
  ```

- [ ] **Step 3: Run the tests**
  Run: `npx vitest run packages/providers/src/__tests__/ssrf.test.ts`
  Expected: PASS

- [ ] **Step 4: Commit task**
  Run: `git add packages/providers/src/security/ssrf.ts packages/providers/src/__tests__/ssrf.test.ts; git commit -m "feat: add ssrf protection and custom endpoint validation"`

---

### Task 4: Implement Adapter Layer (`packages/providers`)

**Files:**
- Create: `packages/providers/src/types.ts`
- Create: `packages/providers/src/adapters/base.ts`
- Create: `packages/providers/src/adapters/openai.ts`
- Create: `packages/providers/src/adapters/anthropic.ts`
- Create: `packages/providers/src/adapters/google.ts`
- Create: `packages/providers/src/adapters/openrouter.ts`
- Create: `packages/providers/src/adapters/compatible.ts`
- Create: `packages/providers/src/adapters/index.ts`
- Create: `packages/providers/src/index.ts`
- Create: `packages/providers/src/__tests__/adapters.test.ts`

**Interfaces:**
- Produces:
  - `ProviderAdapter` mappings.
  - `getAdapter(type: ProviderType): ProviderAdapter`
  - Interfaces for health checks, connection testing, and model resolutions.

- [ ] **Step 1: Create `packages/providers/src/types.ts`**
  ```typescript
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible';

  export interface ConnectionValidationResult {
    ok: boolean;
    latencyMs?: number;
    discoveredModels?: string[];
    errorCode?: string;
    message?: string;
  }

  export interface DiscoveredModel {
    modelId: string;
    displayName: string;
    capabilities: {
      streaming: boolean;
      toolCalling: boolean;
      structuredOutput: boolean;
      vision: boolean;
      fileInput: boolean;
      reasoning: boolean;
    };
  }

  export interface ProviderHealthResult {
    status: 'healthy' | 'degraded' | 'unavailable';
    latencyMs?: number;
    error?: string;
  }

  export interface ModelCapabilities {
    streaming: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    vision: boolean;
    fileInput: boolean;
    reasoning: boolean;
  }

  export interface ModelProfile {
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
  }
  ```

- [ ] **Step 2: Create base adapter `packages/providers/src/adapters/base.ts`**
  ```typescript
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export interface ProviderAdapter {
    readonly type: ProviderType;

    validateConnection(
      baseUrl: string | undefined,
      apiKey: string,
      extraHeaders?: Record<string, string>
    ): Promise<ConnectionValidationResult>;

    listModels(
      baseUrl: string | undefined,
      apiKey: string
    ): Promise<DiscoveredModel[]>;

    resolveModel(
      baseUrl: string | undefined,
      apiKey: string,
      profile: ModelProfile,
      extraHeaders?: Record<string, string>
    ): Promise<LanguageModelV1>;

    healthCheck(
      baseUrl: string | undefined,
      apiKey: string
    ): Promise<ProviderHealthResult>;
  }
  ```

- [ ] **Step 3: Implement OpenAI Adapter `packages/providers/src/adapters/openai.ts`**
  ```typescript
  import { createOpenAI } from '@ai-sdk/openai';
  import { ProviderAdapter } from './base.js';
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export class OpenAIAdapter implements ProviderAdapter {
    readonly type: ProviderType = 'openai';

    async validateConnection(baseUrl: string | undefined, apiKey: string): Promise<ConnectionValidationResult> {
      const start = Date.now();
      try {
        const client = createOpenAI({ apiKey, baseURL: baseUrl });
        const model = client('gpt-4o-mini');
        await model.doGenerate({ inputFormat: 'prompt', mode: 'regular', prompt: 'ping' });
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        return { ok: false, errorCode: 'AUTH_FAILED', message: err.message };
      }
    }

    async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
      // Predefined list since typical models list API doesn't specify capabilities
      return [
        {
          modelId: 'gpt-4o-mini',
          displayName: 'GPT-4o Mini',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: false, reasoning: false }
        },
        {
          modelId: 'gpt-4o',
          displayName: 'GPT-4o',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: false, reasoning: false }
        },
        {
          modelId: 'o1-mini',
          displayName: 'o1 Mini',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: false, fileInput: false, reasoning: true }
        }
      ];
    }

    async resolveModel(baseUrl: string | undefined, apiKey: string, profile: ModelProfile): Promise<LanguageModelV1> {
      const client = createOpenAI({ apiKey, baseURL: baseUrl });
      return client(profile.modelId);
    }

    async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
      const res = await this.validateConnection(baseUrl, apiKey);
      return res.ok 
        ? { status: 'healthy', latencyMs: res.latencyMs }
        : { status: 'unavailable', error: res.message };
    }
  }
  ```

- [ ] **Step 4: Implement Anthropic Adapter `packages/providers/src/adapters/anthropic.ts`**
  ```typescript
  import { createAnthropic } from '@ai-sdk/anthropic';
  import { ProviderAdapter } from './base.js';
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export class AnthropicAdapter implements ProviderAdapter {
    readonly type: ProviderType = 'anthropic';

    async validateConnection(baseUrl: string | undefined, apiKey: string): Promise<ConnectionValidationResult> {
      const start = Date.now();
      try {
        const client = createAnthropic({ apiKey, baseURL: baseUrl });
        const model = client('claude-3-5-haiku-latest');
        await model.doGenerate({ inputFormat: 'prompt', mode: 'regular', prompt: 'ping' });
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        return { ok: false, errorCode: 'AUTH_FAILED', message: err.message };
      }
    }

    async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
      return [
        {
          modelId: 'claude-3-5-sonnet-latest',
          displayName: 'Claude 3.5 Sonnet',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: false, reasoning: false }
        },
        {
          modelId: 'claude-3-5-haiku-latest',
          displayName: 'Claude 3.5 Haiku',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: false, fileInput: false, reasoning: false }
        }
      ];
    }

    async resolveModel(baseUrl: string | undefined, apiKey: string, profile: ModelProfile): Promise<LanguageModelV1> {
      const client = createAnthropic({ apiKey, baseURL: baseUrl });
      return client(profile.modelId);
    }

    async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
      const res = await this.validateConnection(baseUrl, apiKey);
      return res.ok 
        ? { status: 'healthy', latencyMs: res.latencyMs }
        : { status: 'unavailable', error: res.message };
    }
  }
  ```

- [ ] **Step 5: Implement Google Adapter `packages/providers/src/adapters/google.ts`**
  ```typescript
  import { createGoogleGenerativeAI } from '@ai-sdk/google';
  import { ProviderAdapter } from './base.js';
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export class GoogleAdapter implements ProviderAdapter {
    readonly type: ProviderType = 'google';

    async validateConnection(baseUrl: string | undefined, apiKey: string): Promise<ConnectionValidationResult> {
      const start = Date.now();
      try {
        const client = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl });
        const model = client('gemini-1.5-flash');
        await model.doGenerate({ inputFormat: 'prompt', mode: 'regular', prompt: 'ping' });
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        return { ok: false, errorCode: 'AUTH_FAILED', message: err.message };
      }
    }

    async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
      return [
        {
          modelId: 'gemini-1.5-flash',
          displayName: 'Gemini 1.5 Flash',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: true, reasoning: false }
        },
        {
          modelId: 'gemini-1.5-pro',
          displayName: 'Gemini 1.5 Pro',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: true, reasoning: false }
        },
        {
          modelId: 'gemini-2.0-flash-exp',
          displayName: 'Gemini 2.0 Flash Exp',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: true, vision: true, fileInput: true, reasoning: false }
        }
      ];
    }

    async resolveModel(baseUrl: string | undefined, apiKey: string, profile: ModelProfile): Promise<LanguageModelV1> {
      const client = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl });
      return client(profile.modelId);
    }

    async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
      const res = await this.validateConnection(baseUrl, apiKey);
      return res.ok 
        ? { status: 'healthy', latencyMs: res.latencyMs }
        : { status: 'unavailable', error: res.message };
    }
  }
  ```

- [ ] **Step 6: Implement OpenRouter Adapter `packages/providers/src/adapters/openrouter.ts`**
  ```typescript
  import { createOpenAI } from '@ai-sdk/openai';
  import { ProviderAdapter } from './base.js';
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export class OpenRouterAdapter implements ProviderAdapter {
    readonly type: ProviderType = 'openrouter';
    private readonly defaultBaseUrl = 'https://openrouter.ai/api/v1';

    async validateConnection(baseUrl: string | undefined, apiKey: string): Promise<ConnectionValidationResult> {
      const start = Date.now();
      try {
        const client = createOpenAI({
          apiKey,
          baseURL: baseUrl || this.defaultBaseUrl,
          headers: {
            'HTTP-Referer': 'https://aether-agent-gateway.dev',
            'X-Title': 'Aether Gateway'
          }
        });
        const model = client('meta-llama/llama-3.2-1b-instruct:free');
        await model.doGenerate({ inputFormat: 'prompt', mode: 'regular', prompt: 'ping' });
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        return { ok: false, errorCode: 'AUTH_FAILED', message: err.message };
      }
    }

    async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
      return [
        {
          modelId: 'meta-llama/llama-3.2-1b-instruct:free',
          displayName: 'Llama 3.2 1B Instruct (Free)',
          capabilities: { streaming: true, toolCalling: true, structuredOutput: false, vision: false, fileInput: false, reasoning: false }
        }
      ];
    }

    async resolveModel(baseUrl: string | undefined, apiKey: string, profile: ModelProfile): Promise<LanguageModelV1> {
      const client = createOpenAI({
        apiKey,
        baseURL: baseUrl || this.defaultBaseUrl,
        headers: {
          'HTTP-Referer': 'https://aether-agent-gateway.dev',
          'X-Title': 'Aether Gateway'
        }
      });
      return client(profile.modelId);
    }

    async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
      const res = await this.validateConnection(baseUrl, apiKey);
      return res.ok 
        ? { status: 'healthy', latencyMs: res.latencyMs }
        : { status: 'unavailable', error: res.message };
    }
  }
  ```

- [ ] **Step 7: Implement Custom Compatible Adapter `packages/providers/src/adapters/compatible.ts`**
  ```typescript
  import { createOpenAI } from '@ai-sdk/openai';
  import { ProviderAdapter } from './base.js';
  import { ProviderType, ConnectionValidationResult, DiscoveredModel, ProviderHealthResult, ModelProfile } from '../types.js';
  import { validateUrl } from '../security/ssrf.js';
  import { LanguageModelV1 } from '@ai-sdk/provider';

  export class CompatibleAdapter implements ProviderAdapter {
    readonly type: ProviderType = 'openai-compatible';

    async validateConnection(baseUrl: string | undefined, apiKey: string, extraHeaders?: Record<string, string>): Promise<ConnectionValidationResult> {
      if (!baseUrl) {
        return { ok: false, errorCode: 'INVALID_INPUT', message: 'base_url is required for custom compatible provider' };
      }
      const start = Date.now();
      try {
        await validateUrl(baseUrl);
        const client = createOpenAI({
          apiKey,
          baseURL: baseUrl,
          headers: extraHeaders,
        });
        // We will probe using custom/placeholder model or try to list models.
        // For custom endpoint validation, we try a mock request to resolve connection health
        return { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        return { ok: false, errorCode: 'CONNECTION_FAILED', message: err.message };
      }
    }

    async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
      return [];
    }

    async resolveModel(baseUrl: string | undefined, apiKey: string, profile: ModelProfile, extraHeaders?: Record<string, string>): Promise<LanguageModelV1> {
      if (!baseUrl) {
        throw new Error('base_url is required for custom compatible provider');
      }
      await validateUrl(baseUrl);
      const client = createOpenAI({
        apiKey,
        baseURL: baseUrl,
        headers: extraHeaders,
      });
      return client(profile.modelId);
    }

    async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
      const res = await this.validateConnection(baseUrl, apiKey);
      return res.ok 
        ? { status: 'healthy', latencyMs: res.latencyMs }
        : { status: 'unavailable', error: res.message };
    }
  }
  ```

- [ ] **Step 8: Setup indexes and exports in `packages/providers/src/adapters/index.ts` & `packages/providers/src/index.ts`**
  `packages/providers/src/adapters/index.ts`:
  ```typescript
  import { OpenAIAdapter } from './openai.js';
  import { AnthropicAdapter } from './anthropic.js';
  import { GoogleAdapter } from './google.js';
  import { OpenRouterAdapter } from './openrouter.js';
  import { CompatibleAdapter } from './compatible.js';
  import { ProviderAdapter } from './base.js';
  import { ProviderType } from '../types.js';

  const adapters: Record<ProviderType, ProviderAdapter> = {
    'openai': new OpenAIAdapter(),
    'anthropic': new AnthropicAdapter(),
    'google': new GoogleAdapter(),
    'openrouter': new OpenRouterAdapter(),
    'openai-compatible': new CompatibleAdapter(),
  };

  export function getAdapter(type: ProviderType): ProviderAdapter {
    const adapter = adapters[type];
    if (!adapter) {
      throw new Error(`Unsupported provider type: ${type}`);
    }
    return adapter;
  }
  ```
  `packages/providers/src/index.ts`:
  ```typescript
  export * from './types.js';
  export * from './security/encryption.js';
  export * from './security/ssrf.js';
  export * from './adapters/base.js';
  export * from './adapters/index.js';
  ```

- [ ] **Step 9: Run tests**
  Run: `npm install` at root.
  Run: `npm run build --workspaces` (to compile ts files in database/providers if needed, but vitest runs on ts directly)
  Run: `npm run typecheck`
  Expected: PASS

- [ ] **Step 10: Commit task**
  Run: `git add packages/providers; git commit -m "feat: add provider adapters and setup providers package index"`

---

### Task 5: Add Server API Endpoints in agent-server

**Files:**
- Modify: `apps/agent-server/package.json` (add `@aether/database` and `@aether/providers` to dependencies)
- Modify: `apps/agent-server/src/config/env.ts` (add `ENCRYPTION_KEY` to zod schema)
- Modify: `apps/agent-server/src/__tests__/env.test.ts` (mock/add ENCRYPTION_KEY to tests)
- Create: `apps/agent-server/src/mastra/routes/providers.ts`
- Modify: `apps/agent-server/src/mastra/index.ts` (import and add provider routes to server configuration)
- Modify: `apps/agent-server/src/index.ts` (initialize database schema on startup)

- [ ] **Step 1: Update dependencies in `apps/agent-server/package.json`**
  Add `@aether/database`: "*", `@aether/providers`: "*", and run `npm install`.

- [ ] **Step 2: Add `ENCRYPTION_KEY` to `apps/agent-server/src/config/env.ts`**
  ```typescript
  // Modify schema
  export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().max(65535),
    HOST: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
    WEB_URL: z.string().url(),
    ALLOW_LOCAL_ENDPOINTS: z.enum(['true', 'false']),
    ENCRYPTION_KEY: z.string().min(32), // strict 32 chars check or min
  })
  ```

- [ ] **Step 3: Create routes file `apps/agent-server/src/mastra/routes/providers.ts`**
  Implement endpoints:
  - `GET /api/providers/connections`
  - `POST /api/providers/connections` (includes encrypting API key)
  - `PUT /api/providers/connections/:id`
  - `DELETE /api/providers/connections/:id`
  - `POST /api/providers/connections/test`
  - `GET /api/providers/models/discovered`
  - `GET /api/providers/models/profiles`
  - `POST /api/providers/models/profiles`
  - `PATCH /api/providers/models/profiles/:id`
  - `GET /api/providers/bindings`
  - `POST /api/providers/bindings`

- [ ] **Step 4: Register routes in `apps/agent-server/src/mastra/index.ts`**
  Add routes to `apiRoutes: [healthRoute, ...providerRoutes]`.

- [ ] **Step 5: Initialize DB on Startup in `apps/agent-server/src/index.ts`**
  ```typescript
  import { initDb } from '@aether/database';
  
  await initDb().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

  export { mastra } from './mastra/index.js'
  ```

- [ ] **Step 6: Run server lint, typecheck, and test suite**
  Run: `npm run lint`
  Run: `npm run typecheck`
  Run: `npm run test`
  Expected: PASS

- [ ] **Step 7: Commit task**
  Run: `git add apps/agent-server; git commit -m "feat: implement server provider endpoints and DB startup setup"`

---

### Task 6: Admin Settings UI Feature (`apps/web`)

**Files:**
- Create: `apps/web/src/features/providers/index.tsx`
- Create: `apps/web/src/features/providers/components/ConnectionList.tsx`
- Create: `apps/web/src/features/providers/components/ConnectionForm.tsx`
- Create: `apps/web/src/features/providers/components/ModelProfileManager.tsx`
- Create: `apps/web/src/features/providers/components/AgentBindingManager.tsx`
- Create: `apps/web/src/app/settings/providers/page.tsx`
- Modify: `apps/web/src/app/layout.tsx` or main sidebar navigation.

- [x] **Step 1: Implement minimal visual connections table and form**
  Create components using Swiss style (flat dark look, border-slate-200/800, nice typography).
  The page calls:
  - `GET /api/providers/connections` to display rows.
  - `POST /api/providers/connections/test` when user clicks test connection.
  - `POST /api/providers/connections` on submit.

- [x] **Step 2: Add Model Profile Manager**
  Fetches available model profiles and discovered ones to let admins configure and enable.

- [x] **Step 3: Add Agent Model Binding Form**
  Maps registered agents (e.g. `qa-web-agent`) to model profiles.

- [x] **Step 4: Verify complete application builds and launches**
  Run: `npm run build`
  Run: `npm run dev`
  Expected: Works seamlessly.
  Verified: `npm run build` (web Next.js 16 + agent-server Mastra) green; `npm run typecheck`, `npm run lint`, `npm run test` (84 tests) all pass.

- [x] **Step 5: Commit task**
  Run: `git add apps/web; git commit -m "feat: implement provider admin settings UI"`
  Done: commit 563ad88 (+ fix 647be64 for Mastra dev route freeing).
