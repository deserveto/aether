import type { CatalogAgent, AgentManifest, AgentCategory, AgentStatus } from '@aether/shared'
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

export interface StoredAgentRow {
  readonly id: string
  readonly status: 'draft' | 'published' | 'archived'
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly category: AgentCategory
  readonly capabilities: string[]
  readonly toolIds: string[]
  readonly primaryModelProfileId: string | null
  readonly fallbackModelProfileIds: string[]
  readonly memoryEnabled: boolean
  readonly memoryMode: 'thread' | 'resource-and-thread'
  readonly visibility: 'private' | 'internal' | 'public'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AgentRuntimeDeps {
  listBuiltIn(): readonly BuiltInAgentDeclaration[]
  findBinding(agentId: string): Promise<BindingRow | undefined>
  findProfile(profileId: string): Promise<ProfileRow | undefined>
  findConnection(connectionId: string): Promise<ConnectionRow | undefined>
  listStoredAgents(status?: AgentStatus): Promise<StoredAgentRow[]>
  findStoredAgent(id: string, status: AgentStatus): Promise<StoredAgentRow | undefined>
}

export interface ResolvedAgent {
  readonly manifest: AgentManifest
  readonly configured: boolean
}

async function isConfiguredForProfile(
  deps: AgentRuntimeDeps,
  primaryModelProfileId: string | null,
): Promise<boolean> {
  if (!primaryModelProfileId) return false
  const profile = await deps.findProfile(primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) return false
  const connection = await deps.findConnection(profile.providerConnectionId)
  return Boolean(connection && connection.enabled)
}

export function mapStoredToManifest(stored: StoredAgentRow): AgentManifest {
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    category: stored.category,
    source: 'stored',
    status: stored.status,
    protected: false,
    capabilities: stored.capabilities,
    toolIds: stored.toolIds,
    modelBinding: stored.primaryModelProfileId
      ? {
          primaryModelProfileId: stored.primaryModelProfileId,
          fallbackModelProfileIds: stored.fallbackModelProfileIds,
        }
      : null,
    memory: { enabled: stored.memoryEnabled, mode: stored.memoryMode },
    visibility: stored.visibility,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  }
}

export async function resolveCatalog(deps: AgentRuntimeDeps): Promise<CatalogAgent[]> {
  const builtIn = deps.listBuiltIn()
  const stored = await deps.listStoredAgents('published')

  const builtInCatalog = await Promise.all(
    builtIn.map(async (agent) => {
      const binding = await deps.findBinding(agent.manifest.id)
      return {
        manifest: agent.manifest,
        configured: await isConfiguredForProfile(deps, binding?.primaryModelProfileId ?? null),
      }
    }),
  )

  const storedCatalog = await Promise.all(
    stored.map(async (agent) => ({
      manifest: mapStoredToManifest(agent),
      configured: await isConfiguredForProfile(deps, agent.primaryModelProfileId),
    })),
  )

  return [...builtInCatalog, ...storedCatalog]
}

export async function resolveAgent(
  deps: AgentRuntimeDeps,
  id: string,
  version: 'published' | 'draft' = 'published',
): Promise<ResolvedAgent | null> {
  if (version === 'published') {
    const builtIn = deps.listBuiltIn().find((item) => item.manifest.id === id)
    if (builtIn) {
      const binding = await deps.findBinding(id)
      return {
        manifest: builtIn.manifest,
        configured: await isConfiguredForProfile(deps, binding?.primaryModelProfileId ?? null),
      }
    }
    const stored = await deps.findStoredAgent(id, 'published')
    if (!stored) return null
    return {
      manifest: mapStoredToManifest(stored),
      configured: await isConfiguredForProfile(deps, stored.primaryModelProfileId),
    }
  } else {
    const stored = await deps.findStoredAgent(id, 'draft')
    if (!stored) return null
    return {
      manifest: mapStoredToManifest(stored),
      configured: await isConfiguredForProfile(deps, stored.primaryModelProfileId),
    }
  }
}
