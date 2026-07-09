import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@mastra/core/agent'
import { buildChatDependencies } from '../services/conversations.js'

function emptyStream() {
  return (async function* () {})()
}

function agent(methods: Record<string, unknown>): Agent {
  return methods as unknown as Agent
}

describe('conversation chat dependencies', () => {
  it('resolves the agent for each stream request', async () => {
    const first = agent({
      stream: vi.fn(async () => ({ runId: 'run-1', fullStream: emptyStream() })),
    })
    const second = agent({
      stream: vi.fn(async () => ({ runId: 'run-2', fullStream: emptyStream() })),
    })
    let current = first
    const deps = buildChatDependencies({
      userId: 'local-user',
      getAgent: vi.fn(async () => current),
      recordToolEvent: vi.fn(async () => undefined),
      persistUserMessage: vi.fn(async () => undefined),
    })

    await deps.startStream({
      conversationId: 'conv-1',
      agentId: 'qa-web-agent',
      threadId: 'thread-1',
      resourceId: 'local-user',
      text: 'first',
    })
    current = second
    await deps.startStream({
      conversationId: 'conv-1',
      agentId: 'qa-web-agent',
      threadId: 'thread-1',
      resourceId: 'local-user',
      text: 'second',
    })

    expect(first.stream).toHaveBeenCalledTimes(1)
    expect(second.stream).toHaveBeenCalledTimes(1)
  })

  it('uses the conversation agent for suspended run lookup and approval decisions', async () => {
    const wrongAgent = agent({
      listSuspendedRuns: vi.fn(async () => ({ runs: [] })),
      approveToolCall: vi.fn(async () => ({ fullStream: emptyStream() })),
      declineToolCall: vi.fn(async () => ({ fullStream: emptyStream() })),
    })
    const qaAgent = agent({
      listSuspendedRuns: vi.fn(async () => ({ runs: [{ runId: 'run-1', toolCalls: [] }] })),
      approveToolCall: vi.fn(async () => ({ fullStream: emptyStream() })),
      declineToolCall: vi.fn(async () => ({ fullStream: emptyStream() })),
    })
    const getAgent = vi.fn(async (agentId: string) =>
      agentId === 'qa-web-agent' ? qaAgent : wrongAgent,
    )
    const deps = buildChatDependencies({
      userId: 'local-user',
      getAgent,
      recordToolEvent: vi.fn(async () => undefined),
      persistUserMessage: vi.fn(async () => undefined),
    })

    await deps.listSuspendedRuns('qa-web-agent', 'thread-1', 'local-user')
    await deps.approve('qa-web-agent', 'run-1', 'tool-1')
    await deps.decline('qa-web-agent', 'run-1', 'tool-1')

    expect(qaAgent.listSuspendedRuns).toHaveBeenCalledWith({
      threadId: 'thread-1',
      resourceId: 'local-user',
    })
    expect(qaAgent.approveToolCall).toHaveBeenCalledWith({ runId: 'run-1', toolCallId: 'tool-1' })
    expect(qaAgent.declineToolCall).toHaveBeenCalledWith({ runId: 'run-1', toolCallId: 'tool-1' })
    expect(wrongAgent.approveToolCall).not.toHaveBeenCalled()
  })
})
