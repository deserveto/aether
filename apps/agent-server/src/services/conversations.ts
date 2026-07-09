import { randomUUID } from 'node:crypto'
import { conversations, db } from '@aether/database'
import type { Agent } from '@mastra/core/agent'
import type { ChatRouteDependencies, ContinuationStream } from '../mastra/routes/chat.js'
import type { ConversationRecord } from '../mastra/routes/conversations.js'
import type { StreamChunk } from '../mastra/stream-mapper.js'

export async function createConversation(
  userId: string,
  agentId: string,
  title: string,
  agentVersion: 'published' | 'draft' = 'published',
): Promise<ConversationRecord> {
  const now = new Date().toISOString()
  const [row] = await db
    .insert(conversations)
    .values({
      id: randomUUID(),
      userId,
      agentId,
      agentVersion,
      threadId: randomUUID(),
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row as ConversationRecord
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const rows = await db.query.conversations.findMany()
  return rows.filter((row) => row.userId === userId)
}

export async function findConversation(
  id: string,
  userId: string,
): Promise<ConversationRecord | undefined> {
  const row = await db.query.conversations.findFirst({
    where: (fields, operators) => operators.eq(fields.id, id),
  })
  if (!row || row.userId !== userId) return undefined
  return row as ConversationRecord
}

export function buildChatDependencies(opts: {
  userId: string
  getAgent(agentId: string, conversationId?: string): Promise<Agent>
  recordToolEvent: ChatRouteDependencies['recordToolEvent']
  persistUserMessage: ChatRouteDependencies['persistUserMessage']
}): ChatRouteDependencies {
  return {
    userId: opts.userId,
    findConversation: (id) => findConversation(id, opts.userId),
    persistUserMessage: opts.persistUserMessage,
    recordToolEvent: opts.recordToolEvent,
    startStream: async ({ conversationId, agentId, threadId, resourceId, text }) => {
      const agent = await opts.getAgent(agentId, conversationId)
      const stream = await agent.stream(text, {
        memory: { thread: threadId, resource: resourceId },
        requireToolApproval: false,
      })
      return { runId: stream.runId, fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
    listSuspendedRuns: async (agentId, threadId, resourceId, conversationId) => {
      const agent = await opts.getAgent(agentId, conversationId)
      const { runs } = await agent.listSuspendedRuns({ threadId, resourceId })
      return {
        runs: runs.flatMap((run) =>
          (run.toolCalls ?? [])
            .filter((tc) => !!tc.toolCallId)
            .map((tc) => ({ runId: run.runId, toolCallId: tc.toolCallId as string })),
        ),
      }
    },
    approve: async (agentId, runId, toolCallId, conversationId): Promise<ContinuationStream> => {
      const agent = await opts.getAgent(agentId, conversationId)
      const stream = await agent.approveToolCall({ runId, toolCallId })
      return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
    decline: async (agentId, runId, toolCallId, conversationId): Promise<ContinuationStream> => {
      const agent = await opts.getAgent(agentId, conversationId)
      const stream = await agent.declineToolCall({ runId, toolCallId })
      return { fullStream: stream.fullStream as AsyncIterable<StreamChunk> }
    },
  }
}
