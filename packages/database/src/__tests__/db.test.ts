import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  db,
  client,
  initDb,
  providerConnections,
  modelProfiles,
  agentModelBindings,
} from '../index.js'

describe('Database Initialization and Operations', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()
    // Explicitly enable foreign keys in SQLite for this connection
    await client.execute('PRAGMA foreign_keys = ON;')
  })

  it('can insert and retrieve a provider connection', async () => {
    // Clear connection first to keep test isolated
    await db.delete(providerConnections)

    await db.insert(providerConnections).values({
      id: 'conn-1',
      name: 'OpenAI Dev',
      type: 'openai',
      secretRef: 'env:OPENAI_API_KEY',
      enabled: true,
      status: 'untested',
    })

    const retrieved = await db.query.providerConnections.findFirst({
      where: (fields, { eq }) => eq(fields.id, 'conn-1'),
    })

    expect(retrieved).toBeDefined()
    expect(retrieved?.name).toBe('OpenAI Dev')
    expect(retrieved?.type).toBe('openai')
  })

  it('can handle model profiles and agent model bindings with cascade delete and restrict constraints', async () => {
    // Clean up tables
    await db.delete(agentModelBindings)
    await db.delete(modelProfiles)
    await db.delete(providerConnections)

    // 1. Insert connection
    await db.insert(providerConnections).values({
      id: 'conn-temp',
      name: 'Temp Provider',
      type: 'anthropic',
      secretRef: 'env:ANTHROPIC_API_KEY',
      enabled: true,
      status: 'untested',
    })

    // 2. Insert model profile
    const capabilities = {
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      fileInput: false,
      reasoning: true,
    }
    const defaultSettings = {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }

    await db.insert(modelProfiles).values({
      id: 'profile-temp',
      providerConnectionId: 'conn-temp',
      modelId: 'claude-3-5-sonnet',
      displayName: 'Claude 3.5 Sonnet',
      capabilities,
      approved: true,
      enabled: true,
      defaultSettings,
    })

    // Retrieve and verify model profile (including JSON parsing behavior)
    const profile = await db.query.modelProfiles.findFirst({
      where: (fields, { eq }) => eq(fields.id, 'profile-temp'),
    })
    expect(profile).toBeDefined()
    expect(profile?.displayName).toBe('Claude 3.5 Sonnet')
    expect(profile?.capabilities).toEqual(capabilities)
    expect(profile?.defaultSettings).toEqual(defaultSettings)

    // 3. Insert agent model binding
    const fallbackIds = ['profile-fallback-1', 'profile-fallback-2']
    await db.insert(agentModelBindings).values({
      agentId: 'agent-temp',
      primaryModelProfileId: 'profile-temp',
      fallbackModelProfileIds: fallbackIds,
    })

    // Retrieve and verify agent model binding
    const binding = await db.query.agentModelBindings.findFirst({
      where: (fields, { eq }) => eq(fields.agentId, 'agent-temp'),
    })
    expect(binding).toBeDefined()
    expect(binding?.primaryModelProfileId).toBe('profile-temp')
    expect(binding?.fallbackModelProfileIds).toEqual(fallbackIds)

    // 4. Test ON DELETE RESTRICT on model profile
    // Deleting profile-temp should throw an error because it is referenced by agent-temp
    await expect(
      db.delete(modelProfiles).where(eq(modelProfiles.id, 'profile-temp')),
    ).rejects.toThrow()

    // 5. Test ON DELETE CASCADE on provider connection
    // Let's first delete the agent model binding to release the restrict foreign key check
    await db.delete(agentModelBindings).where(eq(agentModelBindings.agentId, 'agent-temp'))

    // Now delete the provider connection
    await db.delete(providerConnections).where(eq(providerConnections.id, 'conn-temp'))

    // The associated model profile should have been cascade-deleted automatically
    const deletedProfile = await db.query.modelProfiles.findFirst({
      where: (fields, { eq }) => eq(fields.id, 'profile-temp'),
    })
    expect(deletedProfile).toBeUndefined()
  })
})
