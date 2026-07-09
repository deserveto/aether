import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { AppError, ErrorCode } from '@aether/shared'
import { z, ZodError } from 'zod'
import { mapStreamToSse, type StreamChunk } from '../stream-mapper.js'
import { setConversationId } from '../../agents/conversation-context.js'

export interface ConversationRef {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly status: 'active' | 'archived'
}

export interface ContinuationStream {
  readonly fullStream: AsyncIterable<StreamChunk>
}

export interface ChatRouteDependencies {
  readonly userId: string
  findConversation(id: string): Promise<ConversationRef | undefined>
  persistUserMessage(threadId: string, resourceId: string, text: string): Promise<void>
  recordToolEvent(event: {
    readonly conversationId: string
    readonly toolCallId: string
    readonly toolName: string
    readonly status: 'requested' | 'success' | 'error'
    readonly input?: unknown
    readonly output?: unknown
  }): Promise<void>
  startStream(input: {
    readonly conversationId: string
    readonly agentId: string
    readonly threadId: string
    readonly resourceId: string
    readonly text: string
  }): Promise<{ readonly runId: string; readonly fullStream: AsyncIterable<StreamChunk> }>
  listSuspendedRuns(
    threadId: string,
    resourceId: string,
  ): Promise<{ readonly runs: readonly { readonly runId: string; readonly toolCallId: string }[] }>
  approve(runId: string, toolCallId: string): Promise<ContinuationStream>
  decline(runId: string, toolCallId: string): Promise<ContinuationStream>
}

const messageSchema = z.object({ text: z.string().min(1) })
const approvalSchema = z.object({ decision: z.enum(['approve', 'deny']) })

function errorResponse(c: { json(body: unknown, status?: number): Response }, error: unknown) {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid request', issues: error.issues },
      },
      400,
    )
  }
  if (error instanceof AppError) {
    return c.json(
      { error: { code: error.code, message: error.message } },
      error.code === ErrorCode.INVALID_INPUT ? 400 : 502,
    )
  }
  return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
}

function notFound(c: { json(body: unknown, status?: number): Response }) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export function createChatRoutes(deps: ChatRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/conversations/:id/messages', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = messageSchema.parse(await c.req.json())
          const conversation = await deps.findConversation(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          setConversationId(conversation.id)
          await deps.persistUserMessage(conversation.threadId, deps.userId, input.text)
          const { runId, fullStream } = await deps.startStream({
            conversationId: conversation.id,
            agentId: conversation.agentId,
            threadId: conversation.threadId,
            resourceId: deps.userId,
            text: input.text,
          })
          return sseResponse(
            mapStreamToSse(fullStream, {
              runId,
              conversationId: conversation.id,
              onToolEvent: (event) => {
                void deps.recordToolEvent(event)
              },
            }),
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/conversations/:id/approvals/:toolCallId', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = approvalSchema.parse(await c.req.json())
          const conversation = await deps.findConversation(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          setConversationId(conversation.id)
          const { runs } = await deps.listSuspendedRuns(conversation.threadId, deps.userId)
          const run = runs[0]
          const toolCallId = c.req.param('toolCallId')
          if (!run)
            return c.json({ error: { code: 'NOT_FOUND', message: 'No suspended run' } }, 404)
          const continuation =
            input.decision === 'approve'
              ? await deps.approve(run.runId, toolCallId)
              : await deps.decline(run.runId, toolCallId)
          return sseResponse(
            mapStreamToSse(continuation.fullStream, {
              runId: run.runId,
              conversationId: conversation.id,
            }),
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
  ]
}
