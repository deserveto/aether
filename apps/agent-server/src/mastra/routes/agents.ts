import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import type { CatalogAgent } from '@aether/shared'
import { resolveAgent, resolveCatalog, type AgentRuntimeDeps } from '../../agents/resolver.js'

export interface AgentRouteDependencies {
  listCatalog(): Promise<CatalogAgent[]>
  getAgent(id: string): Promise<{ manifest: CatalogAgent['manifest']; configured: boolean } | null>
}

function notFound(c: { json(body: unknown, status?: number): Response }, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found` } }, 404)
}

export function createAgentRoutes(deps: AgentRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/agents', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.listCatalog())
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),
    registerApiRoute('/api/agents/:id', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const agent = await deps.getAgent(c.req.param('id'))
          if (!agent) return notFound(c, 'Agent')
          return c.json(agent)
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),
  ]
}

export function createProductionAgentRoutes(runtime: AgentRuntimeDeps): ApiRoute[] {
  return createAgentRoutes({
    listCatalog: () => resolveCatalog(runtime),
    getAgent: (id) => resolveAgent(runtime, id),
  })
}
