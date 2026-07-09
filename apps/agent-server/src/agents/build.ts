import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { BrowserSessionStore } from '@aether/tools'
import { getAdapter } from '@aether/providers'
import type { ModelProfile, ProviderAdapter } from '@aether/providers'
import type { AgentManifest } from '@aether/shared'
import { buildBrowserTools } from '../tools/browser.js'
import {
  mapStoredToManifest,
  type AgentRuntimeDeps,
} from './resolver.js'

type ResolvedModel = Awaited<ReturnType<ProviderAdapter['resolveModel']>>

export interface MastraAgentDeps extends AgentRuntimeDeps {
  readonly databaseUrl: string
  readonly memory?: Memory
  readonly sessionStore?: BrowserSessionStore
  resolveSecret(secretRef: string): Promise<string>
}

async function resolveRequiredLanguageModel(
  deps: MastraAgentDeps,
  agentId: string,
  manifest: AgentManifest | null = null,
): Promise<ResolvedModel> {
  const primaryModelProfileId = manifest?.modelBinding
    ? manifest.modelBinding.primaryModelProfileId
    : (await deps.findBinding(agentId))?.primaryModelProfileId ?? null

  if (!primaryModelProfileId) {
    throw new Error(`Agent is not configured with an approved model: ${agentId}`)
  }

  const profile = await deps.findProfile(primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) {
    throw new Error(`Model profile is disabled or unapproved: ${primaryModelProfileId}`)
  }
  const connection = await deps.findConnection(profile.providerConnectionId)
  if (!connection || !connection.enabled) {
    throw new Error(`Provider connection is disabled: ${profile.providerConnectionId}`)
  }
  const apiKey = await deps.resolveSecret(connection.secretRef)
  return getAdapter(connection.type).resolveModel(
    connection.baseUrl ?? undefined,
    apiKey,
    profile as unknown as ModelProfile,
  )
}

export async function buildDynamicAgent(
  deps: MastraAgentDeps,
  agentId: string,
  version: 'published' | 'draft' = 'published',
): Promise<Agent> {
  const sessionStore = deps.sessionStore ?? new BrowserSessionStore()
  const memory =
    deps.memory ??
    new Memory({
      storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
    })

  let name: string
  let instructions: string
  let manifest: AgentManifest

  if (version === 'published') {
    const builtIn = deps.listBuiltIn().find((item) => item.manifest.id === agentId)
    if (builtIn) {
      name = builtIn.manifest.name
      instructions = builtIn.instructions
      manifest = builtIn.manifest
    } else {
      const stored = await deps.findStoredAgent(agentId, 'published')
      if (!stored) throw new Error(`Agent not found: ${agentId}`)
      name = stored.name
      instructions = stored.instructions
      manifest = mapStoredToManifest(stored)
    }
  } else {
    const stored = await deps.findStoredAgent(agentId, 'draft')
    if (!stored) throw new Error(`Draft agent not found: ${agentId}`)
    name = stored.name
    instructions = stored.instructions
    manifest = mapStoredToManifest(stored)
  }

  const allTools = buildBrowserTools(sessionStore)
  const filteredTools = Object.fromEntries(
    Object.entries(allTools).filter(([id]) => manifest.toolIds.includes(id)),
  )

  return new Agent({
    id: agentId,
    name,
    instructions,
    model: () => resolveRequiredLanguageModel(deps, agentId, manifest),
    tools: filteredTools,
    memory,
  })
}

export async function buildMastraAgent(
  deps: MastraAgentDeps,
  declaration: ReturnType<AgentRuntimeDeps['listBuiltIn']>[number],
): Promise<Agent> {
  return buildDynamicAgent(deps, declaration.manifest.id, 'published')
}

export async function buildMastraAgents(deps: MastraAgentDeps): Promise<Record<string, Agent>> {
  const sessionStore = deps.sessionStore ?? new BrowserSessionStore()
  const memory =
    deps.memory ??
    new Memory({
      storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
    })
  const agents: Record<string, Agent> = {}
  for (const declaration of deps.listBuiltIn()) {
    agents[declaration.manifest.id] = await buildDynamicAgent(
      { ...deps, memory, sessionStore },
      declaration.manifest.id,
      'published',
    )
  }
  return agents
}
