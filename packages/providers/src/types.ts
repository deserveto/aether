export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'

export interface ConnectionValidationResult {
  ok: boolean
  latencyMs?: number
  discoveredModels?: string[]
  errorCode?: string
  message?: string
}

export interface DiscoveredModel {
  modelId: string
  displayName: string
  capabilities: {
    streaming: boolean
    toolCalling: boolean
    structuredOutput: boolean
    vision: boolean
    fileInput: boolean
    reasoning: boolean
  }
}

export interface ProviderHealthResult {
  status: 'healthy' | 'degraded' | 'unavailable'
  latencyMs?: number
  error?: string
}

export interface ModelCapabilities {
  streaming: boolean
  toolCalling: boolean
  structuredOutput: boolean
  vision: boolean
  fileInput: boolean
  reasoning: boolean
}

export interface ModelProfile {
  id: string
  providerConnectionId: string
  modelId: string
  displayName: string
  capabilities: ModelCapabilities
  approved: boolean
  enabled: boolean
  defaultSettings?: {
    temperature?: number
    maxOutputTokens?: number
  }
}
