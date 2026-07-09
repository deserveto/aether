import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import type { CatalogAgent } from '@aether/shared'
import { createAgentRoutes, type AgentRouteDependencies } from '../mastra/routes/agents.js'

const publishedManifest = {
  id: 'qa-web-agent',
  name: 'QA Web Agent',
  status: 'published',
} as unknown as CatalogAgent['manifest']

type JsonValue = Record<string, unknown> | unknown[]
function context(params: Record<string, string> = {}) {
  return {
    req: { param: (name: string) => params[name] },
    json: (body: JsonValue, status = 200) => Response.json(body, { status }),
  }
}
function handler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route || !('handler' in route)) throw new Error(`missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => {
    const res = await route.handler(c as never, async () => undefined)
    if (!(res instanceof Response)) throw new Error('no response')
    return res
  }
}

describe('agent catalog routes', () => {
  let deps: AgentRouteDependencies
  beforeEach(() => {
    deps = {
      listCatalog: vi.fn(async () => [{ manifest: publishedManifest, configured: false }]),
      getAgent: vi.fn(async () => ({ manifest: publishedManifest, configured: true })),
    }
  })

  it('registers the catalog API', () => {
    expect(createAgentRoutes(deps).map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/agents',
      'GET /api/agents/:id',
    ])
  })

  it('lists catalog agents', async () => {
    const res = await handler(createAgentRoutes(deps), 'GET', '/api/agents')(context())
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body[0]).toMatchObject({ configured: false })
  })

  it('returns 404 for an unknown agent', async () => {
    deps.getAgent = vi.fn(async () => null)
    const res = await handler(
      createAgentRoutes(deps),
      'GET',
      '/api/agents/:id',
    )(context({ id: 'nope' }))
    expect(res.status).toBe(404)
  })
})
