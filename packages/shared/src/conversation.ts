export interface Conversation {
  readonly id: string
  readonly userId: string
  readonly agentId: string
  readonly threadId: string
  readonly title: string
  readonly status: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export type ToolEventStatus = 'requested' | 'approved' | 'denied' | 'running' | 'success' | 'error'

export interface ToolEvent {
  readonly id: string
  readonly conversationId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly riskLevel: 'read' | 'interactive' | 'consequential' | 'system'
  readonly status: ToolEventStatus
  readonly input: unknown
  readonly output: unknown
  readonly error: { readonly code: string; readonly message: string } | null
  readonly startedAt: string
  readonly endedAt: string | null
}
