export interface StoredAgent {
  readonly id: string
  readonly status: 'draft' | 'published' | 'archived'
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly category: 'qa' | 'research' | 'productivity' | 'social' | 'custom'
  readonly capabilities: readonly string[]
  readonly toolIds: readonly string[]
  readonly primaryModelProfileId: string | null
  readonly fallbackModelProfileIds: readonly string[]
  readonly memoryEnabled: boolean
  readonly memoryMode: 'thread' | 'resource-and-thread'
  readonly visibility: 'private' | 'internal' | 'public'
  readonly createdAt: string
  readonly updatedAt: string
}

interface ApiErrorBody {
  readonly error?: { readonly message?: string }
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
    const fallback = `Request failed: ${response.status} ${response.statusText}`
    let message = fallback
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error?.message ?? fallback
    } catch {
      // keep fallback
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export function listStoredAgents(apiBase: string, signal?: AbortSignal): Promise<StoredAgent[]> {
  return request<StoredAgent[]>(apiBase, '/api/builder/agents', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })
}

export function createStoredAgent(apiBase: string, body: Partial<StoredAgent>): Promise<StoredAgent> {
  return request<StoredAgent>(apiBase, '/api/builder/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateStoredAgent(
  apiBase: string,
  id: string,
  body: Partial<StoredAgent>,
): Promise<StoredAgent> {
  return request<StoredAgent>(apiBase, `/api/builder/agents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function publishStoredAgent(apiBase: string, id: string): Promise<StoredAgent> {
  return request<StoredAgent>(apiBase, `/api/builder/agents/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  })
}

export function archiveStoredAgent(apiBase: string, id: string): Promise<StoredAgent> {
  return request<StoredAgent>(apiBase, `/api/builder/agents/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  })
}

export function deleteStoredAgent(apiBase: string, id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(apiBase, `/api/builder/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
