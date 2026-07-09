export interface StreamChunk {
  readonly type: string
  readonly payload?: Record<string, unknown>
}

export interface ToolEventInput {
  readonly conversationId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly status: 'requested' | 'success' | 'error'
  readonly input?: unknown
  readonly output?: unknown
}

export interface MapHooks {
  readonly runId: string
  readonly conversationId?: string
  onToolEvent?(event: ToolEventInput): void
}

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function serializeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Unknown error'
}

export function mapStreamToSse(
  fullStream: AsyncIterable<StreamChunk>,
  hooks: MapHooks,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of fullStream) {
          const payload = (chunk.payload ?? {}) as Record<string, unknown>
          switch (chunk.type) {
            case 'text-delta':
              controller.enqueue(sse({ type: 'text', text: payload.text }))
              break
            case 'tool-call': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({ conversationId: hooks.conversationId ?? '', toolCallId, toolName, status: 'requested', input: payload.args })
              controller.enqueue(sse({ type: 'tool_start', toolCallId, toolName, args: payload.args }))
              break
            }
            case 'tool-call-approval': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({ conversationId: hooks.conversationId ?? '', toolCallId, toolName, status: 'requested', input: payload.args })
              controller.enqueue(sse({ type: 'tool_approval_required', runId: hooks.runId, toolCallId, toolName, args: payload.args }))
              break
            }
            case 'tool-result': {
              const toolCallId = String(payload.toolCallId)
              const toolName = String(payload.toolName)
              hooks.onToolEvent?.({ conversationId: hooks.conversationId ?? '', toolCallId, toolName, status: 'success', output: payload.result })
              controller.enqueue(sse({ type: 'tool_result', toolCallId, toolName, result: payload.result }))
              break
            }
            case 'finish':
              controller.enqueue(sse({ type: 'message_end' }))
              break
            case 'error':
              controller.enqueue(sse({ type: 'error', message: serializeError(payload.error) }))
              break
            default:
              break
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (error) {
        controller.enqueue(sse({ type: 'error', message: error instanceof Error ? error.message : 'Stream error' }))
      } finally {
        controller.close()
      }
    },
  })
}
