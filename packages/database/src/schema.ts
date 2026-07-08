import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
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
