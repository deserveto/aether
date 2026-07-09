import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { AppError, ErrorCode } from '@aether/shared'
import { z, ZodError } from 'zod'

export interface ConversationRecord {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ResolvedAgentRef {
  readonly manifest: { readonly id: string; readonly status: 'draft' | 'published' | 'archived' }
  readonly configured: boolean
}

export interface ConversationRouteDependencies {
  readonly userId: string
  resolveAgent(agentId: string): Promise<ResolvedAgentRef | null>
  create(agentId: string, title: string): Promise<ConversationRecord>
  list(): Promise<ConversationRecord[]>
  find(id: string): Promise<ConversationRecord | undefined>
  loadMessages(threadId: string, resourceId: string): Promise<unknown[]>
}

const createSchema = z.object({
  agentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
})

function errorResponse(c: { json(body: unknown, status?: number): Response }, error: unknown) {
  if (error instanceof ZodError) {
    return c.json(
      { error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid request', issues: error.issues } },
      400,
    )
  }
  if (error instanceof AppError) {
    const status = error.code === ErrorCode.INVALID_INPUT ? 400 : 502
    return c.json({ error: { code: error.code, message: error.message } }, status)
  }
  return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
}

function notFound(c: { json(body: unknown, status?: number): Response }) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } }, 404)
}

async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Request body must contain valid JSON',
      })
    }
    throw error
  }
}

export function createConversationRoutes(deps: ConversationRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/conversations', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = createSchema.parse(await readJson(c.req))
          const agent = await deps.resolveAgent(input.agentId)
          if (!agent) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
          }
          if (agent.manifest.status === 'archived') {
            return c.json(
              {
                error: {
                  code: 'CONFLICT',
                  message: 'Archived agents cannot start new conversations',
                },
              },
              409,
            )
          }
          if (!agent.configured) {
            return c.json(
              {
                error: {
                  code: ErrorCode.NOT_CONFIGURED,
                  message: 'Agent is not configured with an approved model',
                },
              },
              400,
            )
          }
          const created = await deps.create(input.agentId, input.title)
          return c.json(created, 201)
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/conversations', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.list())
        } catch {
          return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
        }
      },
    }),
    registerApiRoute('/api/conversations/:id', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const conversation = await deps.find(c.req.param('id'))
          if (!conversation || conversation.userId !== deps.userId) return notFound(c)
          const messages = await deps.loadMessages(conversation.threadId, conversation.userId)
          return c.json({ conversation, messages })
        } catch {
          return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
        }
      },
    }),
  ]
}
