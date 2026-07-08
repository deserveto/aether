export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthResponse {
  readonly status: HealthStatus
  readonly service: string
  readonly version: string
  readonly timestamp: string
}

export interface ComponentHealth {
  readonly name: string
  readonly status: HealthStatus
  readonly latencyMs?: number
  readonly error?: string
}
