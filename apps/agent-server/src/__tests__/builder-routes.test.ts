/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initDb, client, db, providerConnections, modelProfiles } from '@aether/database'
import type { ApiRoute } from '@mastra/core/server'
import { createBuilderRoutes } from '../mastra/routes/builder.js'

type JsonValue = Record<string, unknown> | unknown[]
function context(input: {
  body?: unknown
  jsonError?: Error
  params?: Record<string, string>
  query?: Record<string, string>
}) {
  return {
    req: {
      json: async () => {
        if (input.jsonError) throw input.jsonError
        return input.body
      },
      param: (n: string) => input.params?.[n],
      query: (n: string) => input.query?.[n],
    },
    json: (b: JsonValue, status = 200) => Response.json(b, { status }),
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

describe('builder routes integration', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file::memory:'
    await initDb()

    await db.insert(providerConnections).values({
      id: 'conn-1',
      name: 'OpenAI Test',
      type: 'openai',
      secretRef: 'env:OPENAI_API_KEY',
    })
    await db.insert(modelProfiles).values({
      id: 'profile-1',
      providerConnectionId: 'conn-1',
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
      approved: true,
      enabled: true,
    })
  })

  afterEach(async () => {
    await client.execute({ sql: 'DELETE FROM stored_agents', args: [] })
  })

  it('registers the builder API routes', () => {
    const routes = createBuilderRoutes()
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/builder/agents',
      'POST /api/builder/agents',
      'PUT /api/builder/agents/:id',
      'POST /api/builder/agents/:id/publish',
      'POST /api/builder/agents/:id/archive',
      'DELETE /api/builder/agents/:id',
    ])
  })

  it('performs CRUD operations on stored agents', async () => {
    const routes = createBuilderRoutes()

    // 1. Create draft
    const agentData = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      instructions: 'Test instructions',
      category: 'custom',
      capabilities: ['cap-1'],
      toolIds: ['tool-1'],
      primaryModelProfileId: null,
      fallbackModelProfileIds: [],
      memoryEnabled: true,
      memoryMode: 'thread',
      visibility: 'public',
    }

    const createRes = await handler(
      routes,
      'POST',
      '/api/builder/agents',
    )(context({ body: agentData }))
    expect(createRes.status).toBe(200)

    const created = (await createRes.json()) as any
    expect(created.id).toBe('test-agent')
    expect(created.status).toBe('draft')

    // 2. List all agents
    const listRes = await handler(routes, 'GET', '/api/builder/agents')(context({}))
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as any[]
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('test-agent')

    // 3. Update draft
    const updatedData = { ...agentData, name: 'Updated Name', primaryModelProfileId: 'profile-1' }
    const updateRes = await handler(
      routes,
      'PUT',
      '/api/builder/agents/:id',
    )(context({ params: { id: 'test-agent' }, body: updatedData }))
    expect(updateRes.status).toBe(200)

    const updated = (await updateRes.json()) as any
    expect(updated.name).toBe('Updated Name')
    expect(updated.primaryModelProfileId).toBe('profile-1')

    // 4. Publish agent
    const publishRes = await handler(
      routes,
      'POST',
      '/api/builder/agents/:id/publish',
    )(context({ params: { id: 'test-agent' } }))
    expect(publishRes.status).toBe(200)

    const published = (await publishRes.json()) as any
    expect(published.status).toBe('published')

    // 5. Archive agent
    const archiveRes = await handler(
      routes,
      'POST',
      '/api/builder/agents/:id/archive',
    )(context({ params: { id: 'test-agent' } }))
    expect(archiveRes.status).toBe(200)

    const archived = (await archiveRes.json()) as any
    expect(archived.status).toBe('archived')

    // 6. Delete agent
    const deleteRes = await handler(
      routes,
      'DELETE',
      '/api/builder/agents/:id',
    )(context({ params: { id: 'test-agent' } }))
    expect(deleteRes.status).toBe(200)

    const deletion = (await deleteRes.json()) as any
    expect(deletion.success).toBe(true)

    // Verify it is gone
    const emptyListRes = await handler(routes, 'GET', '/api/builder/agents')(context({}))
    const emptyList = (await emptyListRes.json()) as any[]
    expect(emptyList).toHaveLength(0)
  })

  it('rejects duplicate ID creation', async () => {
    const routes = createBuilderRoutes()
    const agentData = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      instructions: 'Test instructions',
      category: 'custom',
      capabilities: [],
      toolIds: [],
      primaryModelProfileId: null,
      fallbackModelProfileIds: [],
      memoryEnabled: true,
      memoryMode: 'thread',
      visibility: 'public',
    }

    const first = await handler(routes, 'POST', '/api/builder/agents')(context({ body: agentData }))
    expect(first.status).toBe(200)

    const second = await handler(
      routes,
      'POST',
      '/api/builder/agents',
    )(context({ body: agentData }))
    expect(second.status).toBe(409)
  })

  it('rejects publishing a draft without a bound model profile', async () => {
    const routes = createBuilderRoutes()
    const agentData = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      instructions: 'Test instructions',
      category: 'custom',
      capabilities: [],
      toolIds: [],
      primaryModelProfileId: null, // Null is invalid for publish
      fallbackModelProfileIds: [],
      memoryEnabled: true,
      memoryMode: 'thread',
      visibility: 'public',
    }

    await handler(routes, 'POST', '/api/builder/agents')(context({ body: agentData }))
    const res = await handler(
      routes,
      'POST',
      '/api/builder/agents/:id/publish',
    )(context({ params: { id: 'test-agent' } }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as any
    expect(body.error.message).toContain('requires model profile to publish')
  })
})
