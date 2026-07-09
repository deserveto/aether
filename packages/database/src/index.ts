import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema.js'

function createLazyProxy<T extends object>(init: () => T): T {
  let instance: T | null = null
  const getTarget = (): T => {
    if (!instance) {
      instance = init()
    }
    return instance
  }

  return new Proxy({} as T, {
    get(_, prop) {
      const target = getTarget()
      const val = Reflect.get(target, prop)
      return typeof val === 'function' ? val.bind(target) : val
    },
    set(_, prop, value) {
      const target = getTarget()
      return Reflect.set(target, prop, value)
    },
    has(_, prop) {
      const target = getTarget()
      return Reflect.has(target, prop)
    },
    ownKeys() {
      const target = getTarget()
      return Reflect.ownKeys(target)
    },
    getOwnPropertyDescriptor(_, prop) {
      const target = getTarget()
      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
    getPrototypeOf() {
      const target = getTarget()
      return Reflect.getPrototypeOf(target)
    },
  })
}

export const client = createLazyProxy(() => {
  const databaseUrl = process.env.DATABASE_URL || 'file:./mastra.db'
  return createClient({ url: databaseUrl })
})

export const db = createLazyProxy(() => {
  return drizzle(client, { schema })
})

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
  `)
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
  `)
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
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS agent_model_bindings (
      agent_id TEXT PRIMARY KEY NOT NULL,
      primary_model_profile_id TEXT NOT NULL,
      fallback_model_profile_ids TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      FOREIGN KEY (primary_model_profile_id) REFERENCES model_profiles(id) ON DELETE RESTRICT
    );
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      thread_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tool_events (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `)
}

export * from './schema.js'
