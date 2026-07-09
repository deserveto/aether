import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { client, conversations, db, initDb, toolEvents } from '../index.js'

describe('conversations and tool events', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()
  })

  afterEach(async () => {
    await client.execute({ sql: 'DELETE FROM tool_events', args: [] })
    await client.execute({ sql: 'DELETE FROM conversations', args: [] })
  })

  it('persists a conversation with its thread id', async () => {
    const now = new Date().toISOString()
    const [created] = await db
      .insert(conversations)
      .values({
        id: 'conv-1',
        userId: 'local-user',
        agentId: 'qa-web-agent',
        threadId: 'thread-1',
        title: 'Test',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    expect(created?.agentId).toBe('qa-web-agent')

    const found = await db.query.conversations.findFirst({
      where: (fields, operators) => operators.eq(fields.id, 'conv-1'),
    })
    expect(found?.threadId).toBe('thread-1')
  })

  it('cascades tool event deletion when a conversation is removed', async () => {
    const now = new Date().toISOString()
    await db.insert(conversations).values({
      id: 'conv-2',
      userId: 'local-user',
      agentId: 'qa-web-agent',
      threadId: 'thread-2',
      title: 'Cascade',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(toolEvents).values({
      id: 'te-1',
      conversationId: 'conv-2',
      toolCallId: 'call-1',
      toolName: 'browser.navigate',
      riskLevel: 'interactive',
      status: 'success',
      input: '{}',
      startedAt: now,
    })
    await db.delete(conversations).where(eq(conversations.id, 'conv-2'))

    const remaining = await db.query.toolEvents.findMany({
      where: (fields, operators) => operators.eq(fields.conversationId, 'conv-2'),
    })
    expect(remaining).toHaveLength(0)
  })
})
