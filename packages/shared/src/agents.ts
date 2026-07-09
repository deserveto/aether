import { AppError, ErrorCode } from './errors.js'

export type AgentSource = 'code' | 'stored'
export type AgentStatus = 'draft' | 'published' | 'archived'
export type AgentCategory = 'qa' | 'research' | 'productivity' | 'social' | 'custom'

export interface AgentModelBinding {
  readonly primaryModelProfileId: string
  readonly fallbackModelProfileIds: readonly string[]
}

export interface AgentManifest {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: AgentCategory
  readonly source: AgentSource
  readonly status: AgentStatus
  readonly protected: boolean
  readonly capabilities: readonly string[]
  readonly toolIds: readonly string[]
  readonly modelBinding: AgentModelBinding | null
  readonly memory: { readonly enabled: boolean; readonly mode: 'thread' | 'resource-and-thread' }
  readonly visibility: 'private' | 'internal' | 'public'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CatalogAgent {
  readonly manifest: AgentManifest
  readonly configured: boolean
}

export const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const RESERVED_AGENT_IDS: ReadonlySet<string> = new Set([
  'qa-web-agent',
  'qa-mobile-agent',
])

export function assertValidAgentId(id: string): true {
  if (!AGENT_ID_PATTERN.test(id)) {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: `Invalid agent id: "${id}". Use lowercase kebab-case.`,
    })
  }
  return true
}
