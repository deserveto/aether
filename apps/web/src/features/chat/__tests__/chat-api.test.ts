import { describe, expect, it, vi } from 'vitest'
import { listAgents, streamMessage } from '../chat-api.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('chat api client', () => {
  it('lists catalog agents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([{ manifest: { id: 'qa-web-agent' }, configured: true }])),
    )
    const agents = await listAgents('http://srv')
    expect(agents[0]?.manifest.id).toBe('qa-web-agent')
    vi.unstubAllGlobals()
  })

  it('parses SSE events from a streamed response', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text","text":"Hi"}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"message_end"}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })),
    )
    const events: unknown[] = []
    for await (const event of streamMessage('http://srv', 'conv-1', { text: 'hi' }))
      events.push(event)
    expect(events).toEqual([{ type: 'text', text: 'Hi' }, { type: 'message_end' }])
    vi.unstubAllGlobals()
  })
})
