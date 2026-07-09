import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import { createChatRoutes, type ChatRouteDependencies } from '../mastra/routes/chat.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: { body?: unknown; params?: Record<string, string> }) {
  return {
    req: {
      json: async () => input.body,
      param: (n: string) => input.params?.[n],
    },
    json: (b: JsonValue, status = 200) => Response.json(b, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => route.handler(c as never, async () => undefined)
}

const conversation = {
  id: 'conv-1', userId: 'local-user', agentId: 'qa-web-agent',
  threadId: 'thread-1', title: 'Hi', status: 'active' as const, createdAt: 't', updatedAt: 't',
}

describe('chat routes', () => {
  let deps: ChatRouteDependencies
  beforeEach(() => {
    deps = {
      userId: 'local-user',
      findConversation: vi.fn(async () => conversation),
      persistUserMessage: vi.fn(async () => undefined),
      recordToolEvent: vi.fn(async () => undefined),
      startStream: vi.fn(async () => ({
        runId: 'run-1',
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: 'ok' } }
          yield { type: 'finish', payload: {} }
        })(),
      })),
      listSuspendedRuns: vi.fn(async () => ({ runs: [{ runId: 'run-1', toolCallId: 'c2' }] })),
      approve: vi.fn(async () => ({ fullStream: (async function* () { yield { type: 'finish', payload: {} } })() })),
      decline: vi.fn(async () => ({ fullStream: (async function* () { yield { type: 'finish', payload: {} } })() })),
    }
  })

  it('registers the chat API', () => {
    expect(createChatRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/conversations/:id/messages',
      'POST /api/conversations/:id/approvals/:toolCallId',
    ])
  })

  it('streams a message response as SSE and persists the user message', async () => {
    const res = await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/messages')(
      context({ params: { id: 'conv-1' }, body: { text: 'hello' } }),
    )
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.persistUserMessage).toHaveBeenCalledWith('thread-1', 'local-user', 'hello')
    const body = await new Response(res.body).text()
    expect(body).toContain('data: {"type":"text"')
    expect(body).toContain('data: [DONE]')
  })

  it('returns 404 when the conversation does not belong to the user', async () => {
    deps.findConversation = vi.fn(async () => undefined)
    const res = await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/messages')(
      context({ params: { id: 'x' }, body: { text: 'hi' } }),
    )
    expect(res.status).toBe(404)
  })

  it('resumes via approve using listSuspendedRuns', async () => {
    const res = await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/approvals/:toolCallId')(
      context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'approve' } }),
    )
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.approve).toHaveBeenCalledWith('run-1', 'c2')
  })

  it('resumes via decline', async () => {
    await handler(createChatRoutes(deps), 'POST', '/api/conversations/:id/approvals/:toolCallId')(
      context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'deny' } }),
    )
    expect(deps.decline).toHaveBeenCalledWith('run-1', 'c2')
  })
})
