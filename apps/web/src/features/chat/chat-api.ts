export interface AgentManifestDto {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly protected: boolean
  readonly capabilities: readonly string[]
  readonly status: string
}

export interface CatalogAgentDto {
  readonly manifest: AgentManifestDto
  readonly configured: boolean
}

export interface ConversationDto {
  readonly id: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export type ChatEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_start'; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: 'tool_approval_required'; readonly runId: string; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
  | { readonly type: 'tool_result'; readonly toolCallId: string; readonly toolName: string; readonly result: unknown }
  | { readonly type: 'message_end' }
  | { readonly type: 'error'; readonly message: string }

interface ApiErrorBody {
  readonly error?: { readonly message?: string }
}

async function request<T>(apiBase: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const fallback = `Request failed: ${response.status} ${response.statusText}`
    let message = fallback
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error?.message ?? fallback
    } catch {
      // keep fallback
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export function listAgents(apiBase: string, signal?: AbortSignal): Promise<CatalogAgentDto[]> {
  return request<CatalogAgentDto[]>(apiBase, '/api/agents', { method: 'GET', ...(signal ? { signal } : {}) })
}

export function createConversation(apiBase: string, agentId: string, title: string): Promise<ConversationDto> {
  return request<ConversationDto>(apiBase, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ agentId, title }),
  })
}

export function listConversations(apiBase: string): Promise<ConversationDto[]> {
  return request<ConversationDto[]>(apiBase, '/api/conversations', { method: 'GET' })
}

export interface ConversationDetail {
  readonly conversation: ConversationDto
  readonly messages: readonly { readonly role: string; readonly content: string }[]
}

export function getConversation(apiBase: string, id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(apiBase, `/api/conversations/${encodeURIComponent(id)}`, { method: 'GET' })
}

export async function* streamMessage(
  apiBase: string,
  conversationId: string,
  body: { readonly text: string },
  signal?: AbortSignal,
): AsyncIterable<ChatEvent> {
  const response = await fetch(
    `${apiBase}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    },
  )
  if (!response.ok || !response.body) throw new Error(`Stream failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      yield JSON.parse(payload) as ChatEvent
    }
  }
}

export async function* submitApproval(
  apiBase: string,
  conversationId: string,
  toolCallId: string,
  decision: 'approve' | 'deny',
): AsyncIterable<ChatEvent> {
  const response = await fetch(
    `${apiBase}/api/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(toolCallId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ decision }),
    },
  )
  if (!response.ok || !response.body) throw new Error(`Approval failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      yield JSON.parse(payload) as ChatEvent
    }
  }
}
