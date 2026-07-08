import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema.js'

const databaseUrl = process.env.DATABASE_URL || 'file:./mastra.db'

export const client = createClient({ url: databaseUrl })
export const db = drizzle(client, { schema })

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
}

export * from './schema.js'
