import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { client, db, initDb, storedAgents, conversations } from '../index.js'

describe('stored agents schema', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()
  })

  afterEach(async () => {
    await client.execute({ sql: 'DELETE FROM stored_agents', args: [] })
    await client.execute({ sql: 'DELETE FROM conversations', args: [] })
  })

  it('creates stored agent draft and published rows', async () => {
    const now = new Date().toISOString()
    const [draft] = await db
      .insert(storedAgents)
      .values({
        id: 'agent-1',
        status: 'draft',
        name: 'Agent 1 Draft',
        description: 'Test',
        instructions: 'Do things',
        category: 'custom',
        capabilities: ['cap-1'],
        toolIds: ['tool-1'],
        fallbackModelProfileIds: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const [published] = await db
      .insert(storedAgents)
      .values({
        id: 'agent-1',
        status: 'published',
        name: 'Agent 1 Published',
        description: 'Test',
        instructions: 'Do things',
        category: 'custom',
        capabilities: ['cap-1'],
        toolIds: ['tool-1'],
        fallbackModelProfileIds: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    expect(draft?.name).toBe('Agent 1 Draft')
    expect(published?.name).toBe('Agent 1 Published')
  })

  it('persists conversations with an agent version', async () => {
    const now = new Date().toISOString()
    const [conv] = await db
      .insert(conversations)
      .values({
        id: 'conv-test-version',
        userId: 'local-user',
        agentId: 'agent-1',
        agentVersion: 'draft',
        threadId: 'thread-test-version',
        title: 'Draft testing conversation',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    expect(conv?.agentVersion).toBe('draft')

    const retrieved = await db.query.conversations.findFirst({
      where: (fields, operators) => operators.eq(fields.id, 'conv-test-version'),
    })
    expect(retrieved?.agentVersion).toBe('draft')
  })
})
