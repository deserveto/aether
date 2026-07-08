import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRoute } from '@mastra/core/server'
import { createProviderRoutes, type ProviderRouteDependencies } from '../mastra/routes/providers.js'

type JsonValue = Record<string, unknown> | unknown[]

function routeHandler(routes: ApiRoute[], method: string, path: string) {
  const route = routes.find((item) => item.method === method && item.path === path)
  if (!route || !('handler' in route)) throw new Error(`Missing ${method} ${path}`)
  return async (c: ReturnType<typeof context>) => {
    const response = await route.handler(c as never, async () => undefined)
    if (!(response instanceof Response)) throw new Error('Route did not return a response')
    return response
  }
}

function context(input: {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
}) {
  return {
    req: {
      json: async () => input.body,
      param: (name: string) => input.params?.[name],
      query: (name: string) => input.query?.[name],
    },
    json: (body: JsonValue, status = 200) => Response.json(body, { status }),
  }
}

const connection = {
  id: 'conn-1',
  name: 'OpenAI',
  type: 'openai' as const,
  baseUrl: null,
  secretRef: 'secret-1',
  enabled: true,
  status: 'untested' as const,
  createdAt: '2026-07-09',
  updatedAt: '2026-07-09',
}

describe('provider routes', () => {
  let deps: ProviderRouteDependencies

  beforeEach(() => {
    deps = {
      connections: {
        list: vi.fn(async () => [connection]),
        find: vi.fn(async () => connection),
        create: vi.fn(async (value) => ({ ...connection, ...value })),
        update: vi.fn(async (_id, value) => ({ ...connection, ...value })),
        remove: vi.fn(async () => true),
      },
      profiles: {
        list: vi.fn(async () => []),
        find: vi.fn(async () => undefined),
        create: vi.fn(async (value) => ({ ...value, createdAt: 'now', updatedAt: 'now' })),
        update: vi.fn(async () => undefined),
      },
      bindings: {
        list: vi.fn(async () => []),
        upsert: vi.fn(async (value) => ({ ...value, createdAt: 'now', updatedAt: 'now' })),
      },
      encryptSecret: vi.fn(async () => 'encrypted-ref'),
      deleteSecret: vi.fn(async () => undefined),
      resolveSecret: vi.fn(async () => 'raw-key'),
      getAdapter: vi.fn(() => ({
        validateConnection: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
        listModels: vi.fn(async () => [
          {
            modelId: 'gpt-4o',
            displayName: 'GPT-4o',
            capabilities: {
              streaming: true,
              toolCalling: true,
              structuredOutput: true,
              vision: true,
              fileInput: false,
              reasoning: false,
            },
          },
        ]),
      })),
    }
  })

  it('registers the complete provider API including connection update', () => {
    const routes = createProviderRoutes(deps)
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /api/providers/connections',
      'POST /api/providers/connections',
      'PUT /api/providers/connections/:id',
      'DELETE /api/providers/connections/:id',
      'POST /api/providers/connections/test',
      'GET /api/providers/models/discovered',
      'GET /api/providers/models/profiles',
      'POST /api/providers/models/profiles',
      'PATCH /api/providers/models/profiles/:id',
      'GET /api/providers/bindings',
      'POST /api/providers/bindings',
    ])
  })

  it('encrypts a new API key and never returns the secret reference', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'POST',
      '/api/providers/connections',
    )(context({ body: { name: 'OpenAI', type: 'openai', apiKey: 'sk-secret' } }))
    const body = (await response.json()) as unknown[]
    expect(response.status).toBe(201)
    expect(deps.encryptSecret).toHaveBeenCalledWith('sk-secret')
    expect(deps.connections.create).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: 'encrypted-ref' }),
    )
    expect(body).not.toHaveProperty('secretRef')
    expect(JSON.stringify(body)).not.toContain('sk-secret')
  })

  it('sanitizes connection list responses', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'GET',
      '/api/providers/connections',
    )(context({}))
    const body = (await response.json()) as unknown[]
    expect(body[0]).not.toHaveProperty('secretRef')
  })

  it('rotates a credential on connection update without returning it', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'PUT',
      '/api/providers/connections/:id',
    )(context({ params: { id: 'conn-1' }, body: { apiKey: 'new-secret', enabled: false } }))
    const body = await response.json()
    expect(deps.encryptSecret).toHaveBeenCalledWith('new-secret')
    expect(deps.connections.update).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({ secretRef: 'encrypted-ref', enabled: false, status: 'untested' }),
    )
    expect(deps.deleteSecret).toHaveBeenCalledWith('secret-1')
    expect(body).not.toHaveProperty('secretRef')
  })

  it('keeps the replacement credential when cleanup of the old secret fails', async () => {
    vi.mocked(deps.deleteSecret).mockRejectedValueOnce(new Error('cleanup failed'))
    const response = await routeHandler(
      createProviderRoutes(deps),
      'PUT',
      '/api/providers/connections/:id',
    )(
      context({
        params: { id: 'conn-1' },
        body: { apiKey: 'new-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(deps.deleteSecret).toHaveBeenCalledTimes(1)
    expect(deps.deleteSecret).not.toHaveBeenCalledWith('encrypted-ref')
  })

  it('tests a stored connection using its resolved credential and persists health', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'POST',
      '/api/providers/connections/test',
    )(context({ body: { connectionId: 'conn-1' } }))
    expect(response.status).toBe(200)
    expect(deps.resolveSecret).toHaveBeenCalledWith('secret-1')
    expect(deps.connections.update).toHaveBeenCalledWith('conn-1', { status: 'healthy' })
    expect(await response.json()).toEqual({ ok: true, latencyMs: 12 })
  })

  it('discovers models for the requested stored connection', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'GET',
      '/api/providers/models/discovered',
    )(context({ query: { connectionId: 'conn-1' } }))
    expect(response.status).toBe(200)
    expect(((await response.json()) as unknown[])[0]).toMatchObject({ modelId: 'gpt-4o' })
  })

  it('rejects malformed input with a stable 400 response', async () => {
    const response = await routeHandler(
      createProviderRoutes(deps),
      'POST',
      '/api/providers/connections',
    )(context({ body: { name: '', type: 'invalid', apiKey: '' } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })

  it('sanitizes unexpected persistence errors', async () => {
    vi.mocked(deps.profiles.list).mockRejectedValueOnce(new Error('sqlite detail'))
    const response = await routeHandler(
      createProviderRoutes(deps),
      'GET',
      '/api/providers/models/profiles',
    )(context({}))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
  })
})
