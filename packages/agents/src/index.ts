import { QA_WEB_AGENT, QA_WEB_INSTRUCTIONS } from './qa-web.js'

export interface BuiltInAgentDeclaration {
  readonly manifest: import('@aether/shared').AgentManifest
  readonly instructions: string
}

export const BUILT_IN_AGENTS: readonly BuiltInAgentDeclaration[] = [
  { manifest: QA_WEB_AGENT, instructions: QA_WEB_INSTRUCTIONS },
]

export function listBuiltIn(): readonly BuiltInAgentDeclaration[] {
  return BUILT_IN_AGENTS
}

export function getBuiltIn(id: string): BuiltInAgentDeclaration | undefined {
  return BUILT_IN_AGENTS.find((agent) => agent.manifest.id === id)
}

export {
  AGENT_ID_PATTERN,
  RESERVED_AGENT_IDS,
  assertValidAgentId,
} from '@aether/shared'
export type {
  AgentManifest,
  AgentSource,
  AgentStatus,
  AgentCategory,
  CatalogAgent,
} from '@aether/shared'
