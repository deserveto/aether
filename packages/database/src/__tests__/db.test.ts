import { describe, it, expect, beforeAll } from 'vitest'
import { db, initDb, providerConnections } from '../index.js'

describe('Database Initialization and Operations', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()
    try {
      await db.delete(providerConnections)
    } catch {
      // Ignore if table not found
    }
  })

  it('can insert and retrieve a provider connection', async () => {
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
})
