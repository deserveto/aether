import { describe, expect, it } from 'vitest'
import { mapStreamToSse, type StreamChunk } from '../mastra/stream-mapper.js'

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

describe('stream mapper', () => {
  it('maps text, tool, approval, result, finish, and error chunks to SSE events', async () => {
    const toolEvents: unknown[] = []
    async function* fake(): AsyncIterable<StreamChunk> {
      yield { type: 'text-delta', payload: { text: 'Hi' } }
      yield { type: 'tool-call', payload: { toolCallId: 'c1', toolName: 'browser.navigate', args: { url: 'https://x' } } }
      yield { type: 'tool-call-approval', payload: { toolCallId: 'c2', toolName: 'browser.click', args: { selector: '#go' } } }
      yield { type: 'tool-result', payload: { toolCallId: 'c2', toolName: 'browser.click', result: { ok: true } } }
      yield { type: 'finish', payload: { stepResult: { reason: 'stop' } } }
    }
    const out = await collect(
      mapStreamToSse(fake(), { runId: 'run-1', onToolEvent: (event) => void toolEvents.push(event) }),
    )
    expect(out).toContain('data: {"type":"text","text":"Hi"}')
    expect(out).toContain('data: {"type":"tool_start"')
    expect(out).toContain('data: {"type":"tool_approval_required"')
    expect(out).toContain('data: {"type":"tool_result"')
    expect(out).toContain('data: {"type":"message_end"}')
    expect(out).toContain('data: [DONE]')
    expect(toolEvents).toHaveLength(3)
  })

  it('emits an error event on error chunks', async () => {
    async function* fake(): AsyncIterable<StreamChunk> {
      yield { type: 'error', payload: { error: { name: 'X', message: 'boom' } } }
    }
    const out = await collect(mapStreamToSse(fake(), { runId: 'r' }))
    expect(out).toContain('data: {"type":"error"')
  })
})
