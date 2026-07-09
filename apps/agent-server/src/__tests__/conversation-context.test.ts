import { describe, expect, it } from 'vitest'
import { getCurrentConversationId, runWithConversationId } from '../agents/conversation-context.js'

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('conversation context', () => {
  it('keeps concurrent async conversation ids isolated', async () => {
    const [first, second] = await Promise.all([
      runWithConversationId('conv-a', async () => {
        await wait()
        return getCurrentConversationId()
      }),
      runWithConversationId('conv-b', async () => {
        await wait()
        return getCurrentConversationId()
      }),
    ])

    expect(first).toBe('conv-a')
    expect(second).toBe('conv-b')
  })
})
