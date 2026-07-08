import { registerApiRoute } from '@mastra/core/server'
import type { HealthResponse } from '@aether/shared'

const SERVICE = 'agent-server'
const VERSION = '0.0.0'

export const healthRoute = registerApiRoute('/healthz', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'Service health',
    description: 'Returns the agent-server health status.',
    tags: ['system'],
    responses: {
      200: { description: 'Service is healthy' },
      503: { description: 'Service is degraded; storage unavailable' },
    },
  },
  handler: async (c) => {
    const mastra = c.get('mastra')
    const storage = mastra.getStorage()
    const timestamp = new Date().toISOString()

    if (!storage) {
      const body: HealthResponse = {
        status: 'degraded',
        service: SERVICE,
        version: VERSION,
        timestamp,
      }
      return c.json(body, 503)
    }

    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE,
      version: VERSION,
      timestamp,
    }
    return c.json(body, 200)
  },
})
