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

// Unconfigured agents receive a placeholder model. They are marked
// configured:false by the resolver and never streamed by the chat route, so
// this object is never actually invoked. It is a valid MastraModelConfig
// member (OpenAICompatibleConfig) so the Agent constructor typechecks without
// a cast hack; if invoked it throws a clear error.
const PLACEHOLDER_MODEL = {
  id: 'aether/__GATEWAY_OPENAI_MODEL__',
  apiKey: 'not-configured',
} as const

export async function buildMastraAgents(deps: MastraAgentDeps): Promise<Record<string, Agent>> {
  const sessionStore = new BrowserSessionStore()
  const memory = new Memory({
    storage: new LibSQLStore({ id: 'aether-memory', url: deps.databaseUrl }),
  })
  const agents: Record<string, Agent> = {}
  for (const declaration of deps.listBuiltIn()) {
    const binding = await deps.findBinding(declaration.manifest.id)
    const resolved = binding ? await resolveLanguageModel(deps, binding) : null
    const agent = new Agent({
      id: declaration.manifest.id,
      name: declaration.manifest.name,
      instructions: declaration.instructions,
      model: resolved?.model ?? PLACEHOLDER_MODEL,
      tools: buildBrowserTools(sessionStore),
      memory,
    })
    agents[declaration.manifest.id] = agent
  }
  return agents
}
