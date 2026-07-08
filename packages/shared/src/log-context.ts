export interface BaseLogContext {
  readonly requestId?: string
  readonly agentId?: string
  readonly conversationId?: string
  readonly userId?: string
}
