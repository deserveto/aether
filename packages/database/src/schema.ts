import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const aetherSecrets = sqliteTable('aether_secrets', {
  id: text('id').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
})

export const providerConnections = sqliteTable('provider_connections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type')
    .$type<'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'>()
    .notNull(),
  baseUrl: text('base_url'),
  secretRef: text('secret_ref').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  status: text('status')
    .$type<'untested' | 'healthy' | 'degraded' | 'unavailable'>()
    .default('untested')
    .notNull(),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
})

export interface ModelCapabilities {
  streaming: boolean
  toolCalling: boolean
  structuredOutput: boolean
  vision: boolean
  fileInput: boolean
  reasoning: boolean
}

export interface ModelDefaultSettings {
  temperature?: number
  maxOutputTokens?: number
}

export const modelProfiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  providerConnectionId: text('provider_connection_id')
    .references(() => providerConnections.id, { onDelete: 'cascade' })
    .notNull(),
  modelId: text('model_id').notNull(),
  displayName: text('display_name').notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<ModelCapabilities>().notNull(), // Stringified JSON: { streaming, toolCalling, structuredOutput, vision, fileInput, reasoning }
  approved: integer('approved', { mode: 'boolean' }).default(false).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  defaultSettings: text('default_settings', { mode: 'json' }).$type<ModelDefaultSettings>(), // Stringified JSON: { temperature, maxOutputTokens }
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
})

export const agentModelBindings = sqliteTable('agent_model_bindings', {
  agentId: text('agent_id').primaryKey(),
  primaryModelProfileId: text('primary_model_profile_id')
    .references(() => modelProfiles.id, { onDelete: 'restrict' })
    .notNull(),
  fallbackModelProfileIds: text('fallback_model_profile_ids', { mode: 'json' })
    .$type<string[]>()
    .notNull(), // Stringified JSON array
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  agentId: text('agent_id').notNull(),
  agentVersion: text('agent_version')
    .$type<'published' | 'draft'>()
    .default('published')
    .notNull(),
  threadId: text('thread_id').notNull().unique(),
  title: text('title').notNull(),
  status: text('status').$type<'active' | 'archived'>().default('active').notNull(),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
})

export interface ToolEventError {
  readonly code: string
  readonly message: string
}

export const toolEvents = sqliteTable('tool_events', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  toolCallId: text('tool_call_id').notNull(),
  toolName: text('tool_name').notNull(),
  riskLevel: text('risk_level')
    .$type<'read' | 'interactive' | 'consequential' | 'system'>()
    .notNull(),
  status: text('status')
    .$type<'requested' | 'approved' | 'denied' | 'running' | 'success' | 'error'>()
    .notNull(),
  input: text('input', { mode: 'json' }).notNull(),
  output: text('output', { mode: 'json' }).$type<unknown>(),
  error: text('error', { mode: 'json' }).$type<ToolEventError>(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
})

export const storedAgents = sqliteTable('stored_agents', {
  id: text('id').notNull(),
  status: text('status')
    .$type<'draft' | 'published' | 'archived'>()
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),
  category: text('category')
    .$type<'qa' | 'research' | 'productivity' | 'social' | 'custom'>()
    .notNull(),
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().notNull(),
  toolIds: text('tool_ids', { mode: 'json' }).$type<string[]>().notNull(),
  primaryModelProfileId: text('primary_model_profile_id')
    .references(() => modelProfiles.id, { onDelete: 'restrict' }),
  fallbackModelProfileIds: text('fallback_model_profile_ids', { mode: 'json' })
    .$type<string[]>()
    .default(sql`'[]'`)
    .notNull(),
  memoryEnabled: integer('memory_enabled', { mode: 'boolean' }).default(true).notNull(),
  memoryMode: text('memory_mode')
    .$type<'thread' | 'resource-and-thread'>()
    .default('thread')
    .notNull(),
  visibility: text('visibility')
    .$type<'private' | 'internal' | 'public'>()
    .default('public')
    .notNull(),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}, (table) => [
  primaryKey({ name: 'stored_agents_pk', columns: [table.id, table.status] }),
])
