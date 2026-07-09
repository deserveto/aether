import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import { createChatRoutes, type ChatRouteDependencies } from '../mastra/routes/chat.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: { body?: unknown; jsonError?: Error; params?: Record<string, string> }) {
  return {
    req: {
      json: async () => {
        if (input.jsonError) throw input.jsonError
        return input.body
      },
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
  id: 'conv-1',
  userId: 'local-user',
  agentId: 'qa-web-agent',
  threadId: 'thread-1',
  title: 'Hi',
  status: 'active' as const,
  createdAt: 't',
  updatedAt: 't',
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
      approve: vi.fn(async () => ({
        fullStream: (async function* () {
          yield { type: 'finish', payload: {} }
        })(),
      })),
      decline: vi.fn(async () => ({
        fullStream: (async function* () {
          yield { type: 'finish', payload: {} }
        })(),
      })),
    }
  })

  it('registers the chat API', () => {
    expect(createChatRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/conversations/:id/messages',
      'POST /api/conversations/:id/approvals/:toolCallId',
    ])
  })

  it('streams a message response as SSE and persists the user message', async () => {
    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/messages',
    )(context({ params: { id: 'conv-1' }, body: { text: 'hello' } }))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.persistUserMessage).toHaveBeenCalledWith('thread-1', 'local-user', 'hello')
    const body = await new Response(res.body).text()
    expect(body).toContain('data: {"type":"text"')
    expect(body).toContain('data: [DONE]')
  })

  it('returns 400 when message JSON is invalid', async () => {
    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/messages',
    )(context({ params: { id: 'conv-1' }, jsonError: new SyntaxError('bad json') }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })

  it('returns 404 when the conversation does not belong to the user', async () => {
    deps.findConversation = vi.fn(async () => undefined)
    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/messages',
    )(context({ params: { id: 'x' }, body: { text: 'hi' } }))
    expect(res.status).toBe(404)
  })

  it('resumes via approve using listSuspendedRuns', async () => {
    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/approvals/:toolCallId',
    )(context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'approve' } }))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(deps.approve).toHaveBeenCalledWith('qa-web-agent', 'run-1', 'c2')
  })

  it('resumes the suspended run matching the requested tool call', async () => {
    deps.listSuspendedRuns = vi.fn(async () => ({
      runs: [
        { runId: 'run-1', toolCallId: 'other-call' },
        { runId: 'run-2', toolCallId: 'c2' },
      ],
    }))

    await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/approvals/:toolCallId',
    )(context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'approve' } }))

    expect(deps.approve).toHaveBeenCalledWith('qa-web-agent', 'run-2', 'c2')
  })

  it('records tool results from an approval continuation stream', async () => {
    deps.approve = vi.fn(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'tool-result',
          payload: { toolCallId: 'c2', toolName: 'browser.click', result: { selector: '#ok' } },
        }
        yield { type: 'finish', payload: {} }
      })(),
    }))

    const res = await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/approvals/:toolCallId',
    )(context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'approve' } }))
    await new Response(res.body).text()

    expect(deps.recordToolEvent).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      toolCallId: 'c2',
      toolName: 'browser.click',
      status: 'success',
      output: { selector: '#ok' },
    })
  })

  it('resumes via decline', async () => {
    await handler(
      createChatRoutes(deps),
      'POST',
      '/api/conversations/:id/approvals/:toolCallId',
    )(context({ params: { id: 'conv-1', toolCallId: 'c2' }, body: { decision: 'deny' } }))
    expect(deps.decline).toHaveBeenCalledWith('qa-web-agent', 'run-1', 'c2')
  })
})
