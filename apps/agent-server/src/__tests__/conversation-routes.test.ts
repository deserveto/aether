import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import {
  createConversationRoutes,
  type ConversationRecord,
  type ConversationRouteDependencies,
  type ResolvedAgentRef,
} from '../mastra/routes/conversations.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: {
  body?: unknown
  jsonError?: Error
  params?: Record<string, string>
  query?: Record<string, string>
}) {
  return {
    req: {
      json: async () => {
        if (input.jsonError) throw input.jsonError
        return input.body
      },
      param: (n: string) => input.params?.[n],
      query: (n: string) => input.query?.[n],
    },
    json: (b: JsonValue, status = 200) => Response.json(b, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => {
    const res = await route.handler(c as never, async () => undefined)
    if (!(res instanceof Response)) throw new Error('no response')
    return res
  }
}

const conversation: ConversationRecord = {
  id: 'conv-1',
  userId: 'local-user',
  agentId: 'qa-web-agent',
  agentVersion: 'published',
  threadId: 'thread-1',
  title: 'Hello',
  status: 'active',
  createdAt: 't',
  updatedAt: 't',
}

describe('conversation routes', () => {
  let deps: ConversationRouteDependencies
  beforeEach(() => {
    deps = {
      userId: 'local-user',
      resolveAgent: vi.fn(async (): Promise<ResolvedAgentRef> => ({
        manifest: { id: 'qa-web-agent', status: 'published' },
        configured: true,
      })),
      create: vi.fn(async (agentId, title) => ({ ...conversation, agentId, title })),
      list: vi.fn(async () => [conversation]),
      find: vi.fn(async () => conversation),
      loadMessages: vi.fn(async () => []),
    }
  })

  it('registers the conversation API', () => {
    expect(createConversationRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/conversations',
      'GET /api/conversations',
      'GET /api/conversations/:id',
    ])
  })

  it('creates a conversation bound to an agent', async () => {
    const res = await handler(
      createConversationRoutes(deps),
      'POST',
      '/api/conversations',
    )(context({ body: { agentId: 'qa-web-agent', title: 'Hello' } }))
    expect(res.status).toBe(201)
    expect(deps.create).toHaveBeenCalledWith('qa-web-agent', 'Hello', 'published')
    const body = await res.json()
    expect(body).toMatchObject({ agentId: 'qa-web-agent', threadId: 'thread-1' })
  })

  it('rejects creating a conversation for an archived agent', async () => {
    deps.resolveAgent = vi.fn(async (): Promise<ResolvedAgentRef> => ({
      manifest: { id: 'qa-web-agent', status: 'archived' },
      configured: true,
    }))
    const res = await handler(
      createConversationRoutes(deps),
      'POST',
      '/api/conversations',
    )(context({ body: { agentId: 'qa-web-agent', title: 'Hello' } }))
    expect(res.status).toBe(409)
    expect(deps.create).not.toHaveBeenCalled()
  })

  it('rejects creating a conversation for an unconfigured agent', async () => {
    deps.resolveAgent = vi.fn(async (): Promise<ResolvedAgentRef> => ({
      manifest: { id: 'qa-web-agent', status: 'published' },
      configured: false,
    }))
    const res = await handler(
      createConversationRoutes(deps),
      'POST',
      '/api/conversations',
    )(context({ body: { agentId: 'qa-web-agent', title: 'Hello' } }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the agent is unknown', async () => {
    deps.resolveAgent = vi.fn(async () => null)
    const res = await handler(
      createConversationRoutes(deps),
      'POST',
      '/api/conversations',
    )(context({ body: { agentId: 'ghost-agent', title: 'Hello' } }))
    expect(res.status).toBe(404)
  })

  it('rejects a conversation without a title', async () => {
    const res = await handler(
      createConversationRoutes(deps),
      'POST',
      '/api/conversations',
    )(context({ body: { agentId: 'qa-web-agent' } }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })

  it('returns 404 for a conversation that does not belong to the user', async () => {
    deps.find = vi.fn(async () => undefined)
    const res = await handler(
      createConversationRoutes(deps),
      'GET',
      '/api/conversations/:id',
    )(context({ params: { id: 'conv-x' } }))
    expect(res.status).toBe(404)
  })

  it('returns the immutable agentId on get (no override path exists)', async () => {
    const res = await handler(
      createConversationRoutes(deps),
      'GET',
      '/api/conversations/:id',
    )(context({ params: { id: 'conv-1' } }))
    const body = (await res.json()) as { conversation: { agentId: string } }
    expect(body.conversation.agentId).toBe('qa-web-agent')
  })
})
