import type { HealthResponse } from '@aether/shared'
import { publicConfig } from './config.js'

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${publicConfig.agentServerUrl}/healthz`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as HealthResponse
}
