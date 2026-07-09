import type { CatalogAgent, AgentManifest } from '@aether/shared'
import type { BuiltInAgentDeclaration } from '@aether/agents'

export interface BindingRow {
  readonly agentId: string
  readonly primaryModelProfileId: string
  readonly fallbackModelProfileIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}
export interface ProfileRow {
  readonly id: string
  readonly providerConnectionId: string
  readonly modelId: string
  readonly displayName: string
  readonly capabilities: unknown
  readonly approved: boolean
  readonly enabled: boolean
  readonly defaultSettings: unknown
  readonly createdAt: string
  readonly updatedAt: string
}
export interface ConnectionRow {
  readonly id: string
  readonly name: string
  readonly type: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'
  readonly baseUrl: string | null
  readonly secretRef: string
  readonly enabled: boolean
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AgentRuntimeDeps {
  listBuiltIn(): readonly BuiltInAgentDeclaration[]
  findBinding(agentId: string): Promise<BindingRow | undefined>
  findProfile(profileId: string): Promise<ProfileRow | undefined>
  findConnection(connectionId: string): Promise<ConnectionRow | undefined>
}

export interface ResolvedAgent {
  readonly manifest: AgentManifest
  readonly configured: boolean
}

async function isConfigured(deps: AgentRuntimeDeps, id: string): Promise<boolean> {
  const binding = await deps.findBinding(id)
  if (!binding) return false
  const profile = await deps.findProfile(binding.primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) return false
  const connection = await deps.findConnection(profile.providerConnectionId)
  return Boolean(connection && connection.enabled)
}

export async function resolveCatalog(deps: AgentRuntimeDeps): Promise<CatalogAgent[]> {
  const agents = deps.listBuiltIn()
  return Promise.all(
    agents.map(async (agent) => ({
      manifest: agent.manifest,
      configured: await isConfigured(deps, agent.manifest.id),
    })),
  )
}

export async function resolveAgent(
  deps: AgentRuntimeDeps,
  id: string,
): Promise<ResolvedAgent | null> {
  const agent = deps.listBuiltIn().find((item) => item.manifest.id === id)
  if (!agent) return null
  return { manifest: agent.manifest, configured: await isConfigured(deps, id) }
}
