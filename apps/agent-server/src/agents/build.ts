import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { BrowserSessionStore } from '@aether/tools'
import { getAdapter } from '@aether/providers'
import type { ModelProfile, ProviderAdapter } from '@aether/providers'
import { buildBrowserTools } from '../tools/browser.js'
import type { AgentRuntimeDeps, BindingRow, ConnectionRow, ProfileRow } from './resolver.js'

type ResolvedModel = Awaited<ReturnType<ProviderAdapter['resolveModel']>>

export interface MastraAgentDeps extends AgentRuntimeDeps {
  readonly databaseUrl: string
  readonly memory?: Memory
  readonly sessionStore?: BrowserSessionStore
  resolveSecret(secretRef: string): Promise<string>
}

async function resolveLanguageModel(
  deps: MastraAgentDeps,
  binding: BindingRow,
): Promise<{ model: ResolvedModel; profile: ProfileRow; connection: ConnectionRow } | null> {
  const profile = await deps.findProfile(binding.primaryModelProfileId)
  if (!profile || !profile.approved || !profile.enabled) return null
  const connection = await deps.findConnection(profile.providerConnectionId)
  if (!connection || !connection.enabled) return null
  const apiKey = await deps.resolveSecret(connection.secretRef)
  const model = await getAdapter(connection.type).resolveModel(
    connection.baseUrl ?? undefined,
    apiKey,
    profile as unknown as ModelProfile,
  )
  return { model, profile, connection }
}

async function resolveRequiredLanguageModel(
  deps: MastraAgentDeps,
  agentId: string,
): Promise<ResolvedModel> {
  const binding = await deps.findBinding(agentId)
  const resolved = binding ? await resolveLanguageModel(deps, binding) : null
  if (!resolved) throw new Error(`Agent is not configured with an approved model: ${agentId}`)
  return resolved.model
}

export async function buildMastraAgent(
  deps: MastraAgentDeps,
  declaration: ReturnType<AgentRuntimeDeps['listBuiltIn']>[number],
): Promise<Agent> {
  const sessionStore = deps.sessionStore ?? new BrowserSessionStore()
  const memory =
    deps.memory ??
    new Memory({
      storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
    })
  return new Agent({
    id: declaration.manifest.id,
    name: declaration.manifest.name,
    instructions: declaration.instructions,
    model: () => resolveRequiredLanguageModel(deps, declaration.manifest.id),
    tools: buildBrowserTools(sessionStore),
    memory,
  })
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
    agents[declaration.manifest.id] = await buildMastraAgent(
      { ...deps, memory, sessionStore },
      declaration,
    )
  }
  return agents
}
