export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'

export type ConnectionStatus = 'untested' | 'healthy' | 'degraded' | 'unavailable'

export interface ProviderConnection {
  readonly id: string
  readonly name: string
  readonly type: ProviderType
  readonly baseUrl: string | null
  readonly enabled: boolean
  readonly status: ConnectionStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ConnectionCreateInput {
  readonly name: string
  readonly type: ProviderType
  readonly baseUrl?: string | null
  readonly apiKey: string
  readonly enabled?: boolean
}

export interface ConnectionTestResult {
  readonly ok: boolean
  readonly latencyMs?: number
  readonly discoveredModels?: readonly string[]
  readonly errorCode?: string
  readonly message?: string
}

export interface ModelCapabilities {
  readonly streaming: boolean
  readonly toolCalling: boolean
  readonly structuredOutput: boolean
  readonly vision: boolean
  readonly fileInput: boolean
  readonly reasoning: boolean
}

export interface DiscoveredModel {
  readonly modelId: string
  readonly displayName: string
  readonly capabilities: ModelCapabilities
}

export interface ModelDefaultSettings {
  readonly temperature?: number
  readonly maxOutputTokens?: number
}

export interface ModelProfile {
  readonly id: string
  readonly providerConnectionId: string
  readonly modelId: string
  readonly displayName: string
  readonly capabilities: ModelCapabilities
  readonly approved: boolean
  readonly enabled: boolean
  readonly defaultSettings?: ModelDefaultSettings | null
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface ModelProfileCreateInput {
  readonly providerConnectionId: string
  readonly modelId: string
  readonly displayName: string
  readonly capabilities: ModelCapabilities
  readonly approved?: boolean
  readonly enabled?: boolean
  readonly defaultSettings?: ModelDefaultSettings
}

export type ModelProfileUpdateInput = Partial<
  Pick<ModelProfile, 'displayName' | 'capabilities' | 'approved' | 'enabled'>
> & { readonly defaultSettings?: ModelDefaultSettings | null }

export interface AgentBinding {
  readonly agentId: string
  readonly primaryModelProfileId: string
  readonly fallbackModelProfileIds: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
}

interface ApiErrorBody {
  readonly error?: { readonly message?: string }
}

function publicConnection(
  value: ProviderConnection & { readonly apiKey?: unknown; readonly secretRef?: unknown },
): ProviderConnection {
  const { apiKey, secretRef, ...connection } = value
  void apiKey
  void secretRef
  return connection
}

async function request<T>(apiBase: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const fallback = `Provider request failed: ${response.status} ${response.statusText}`
    let message = fallback
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error?.message ?? fallback
    } catch {
      // Preserve the status-based fallback when a proxy returns a non-JSON body.
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export async function listConnections(apiBase: string, signal?: AbortSignal) {
  const connections = await request<ProviderConnection[]>(apiBase, '/api/providers/connections', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
  return connections.map(publicConnection)
}

export async function createConnection(apiBase: string, input: ConnectionCreateInput) {
  const connection = await request<ProviderConnection>(apiBase, '/api/providers/connections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return publicConnection(connection)
}

export function testConnection(apiBase: string, connectionId: string) {
  return request<ConnectionTestResult>(apiBase, '/api/providers/connections/test', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })
}

export function deleteConnection(apiBase: string, connectionId: string) {
  return request<{ deleted: boolean }>(
    apiBase,
    `/api/providers/connections/${encodeURIComponent(connectionId)}`,
    { method: 'DELETE' },
  )
}

export function discoverModels(apiBase: string, connectionId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ connectionId })
  return request<DiscoveredModel[]>(apiBase, `/api/providers/models/discovered?${query}`, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
}

export function listModelProfiles(apiBase: string, signal?: AbortSignal) {
  return request<ModelProfile[]>(apiBase, '/api/providers/models/profiles', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
}

export function createModelProfile(apiBase: string, input: ModelProfileCreateInput) {
  return request<ModelProfile>(apiBase, '/api/providers/models/profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateModelProfile(
  apiBase: string,
  profileId: string,
  input: ModelProfileUpdateInput,
) {
  return request<ModelProfile>(
    apiBase,
    `/api/providers/models/profiles/${encodeURIComponent(profileId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function listAgentBindings(apiBase: string, signal?: AbortSignal) {
  return request<AgentBinding[]>(apiBase, '/api/providers/bindings', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
}

export function saveAgentBinding(apiBase: string, input: AgentBinding) {
  return request<AgentBinding>(apiBase, '/api/providers/bindings', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteAgentBinding(apiBase: string, agentId: string) {
  return request<{ deleted: boolean }>(
    apiBase,
    `/api/providers/bindings/${encodeURIComponent(agentId)}`,
    { method: 'DELETE' },
  )
}
