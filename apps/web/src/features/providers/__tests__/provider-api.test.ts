import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConnection,
  createModelProfile,
  deleteAgentBinding,
  deleteConnection,
  discoverModels,
  listAgentBindings,
  listConnections,
  listModelProfiles,
  saveAgentBinding,
  testConnection,
  updateModelProfile,
} from '../provider-api'

const apiBase = 'http://localhost:4111'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider browser API', () => {
  it('lists public connections without requesting cached data', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn(async () =>
      Response.json([
        {
          id: 'connection-1',
          name: 'OpenAI',
          type: 'openai',
          baseUrl: null,
          enabled: true,
          status: 'healthy',
          secretRef: 'must-not-enter-client-state',
          apiKey: 'must-not-enter-client-state',
          createdAt: '2026-07-09',
          updatedAt: '2026-07-09',
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listConnections(apiBase, signal)

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('secretRef')
    expect(result[0]).not.toHaveProperty('apiKey')
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBase}/api/providers/connections`,
      expect.objectContaining({ method: 'GET', cache: 'no-store', signal }),
    )
  })

  it('posts a transient API key only in the connection request body', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          id: 'connection-1',
          name: 'OpenAI',
          type: 'openai',
          baseUrl: null,
          enabled: true,
          status: 'untested',
          createdAt: '2026-07-09',
          updatedAt: '2026-07-09',
        },
        { status: 201 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createConnection(apiBase, {
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'sk-transient',
      enabled: true,
    })

    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('secretRef')
    const request = (fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit])[1]
    expect(JSON.parse(String(request.body))).toEqual({
      name: 'OpenAI',
      type: 'openai',
      apiKey: 'sk-transient',
      enabled: true,
    })
  })

  it('uses the connection test and discovery contracts exactly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true, latencyMs: 24 }))
      .mockResolvedValueOnce(
        Response.json([
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
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(testConnection(apiBase, 'connection-1')).resolves.toEqual({
      ok: true,
      latencyMs: 24,
    })
    await expect(discoverModels(apiBase, 'connection/1')).resolves.toHaveLength(1)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${apiBase}/api/providers/connections/test`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      connectionId: 'connection-1',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${apiBase}/api/providers/models/discovered?connectionId=connection%2F1`,
    )
  })

  it('deletes a connection via DELETE on the connection endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteConnection(apiBase, 'connection/1')

    expect(result).toEqual({ deleted: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${apiBase}/api/providers/connections/connection%2F1`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'DELETE' }),
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.body).toBeUndefined()
  })

  it('deletes an agent binding via DELETE on the binding endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json({ deleted: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteAgentBinding(apiBase, 'qa-web-agent')

    expect(result).toEqual({ deleted: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${apiBase}/api/providers/bindings/qa-web-agent`)
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('posts profile configuration and agent bindings to their defined endpoints', async () => {
    const profile = {
      providerConnectionId: 'connection-1',
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
      defaultSettings: { temperature: 0.4, maxOutputTokens: 2048 },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'profile-1', ...profile }, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({
          agentId: 'qa-web-agent',
          primaryModelProfileId: 'profile-1',
          fallbackModelProfileIds: [],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await createModelProfile(apiBase, profile)
    await saveAgentBinding(apiBase, {
      agentId: 'qa-web-agent',
      primaryModelProfileId: 'profile-1',
      fallbackModelProfileIds: [],
    })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${apiBase}/api/providers/models/profiles`,
      `${apiBase}/api/providers/bindings`,
    ])
  })

  it('loads and updates profiles and bindings through the remaining contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json({
          id: 'profile-1',
          providerConnectionId: 'connection-1',
          modelId: 'gpt-4o',
          displayName: 'Quality model',
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
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await listModelProfiles(apiBase)
    await listAgentBindings(apiBase)
    await updateModelProfile(apiBase, 'profile/1', { displayName: 'Quality model' })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${apiBase}/api/providers/models/profiles`,
      `${apiBase}/api/providers/bindings`,
      `${apiBase}/api/providers/models/profiles/profile%2F1`,
    ])
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Quality model' }),
      }),
    )
  })

  it('surfaces the server error message instead of retaining response data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'INVALID_INPUT', message: 'Bindings require approved profiles' } },
          { status: 400 },
        ),
      ),
    )

    await expect(listConnections(apiBase)).rejects.toThrow('Bindings require approved profiles')
  })
})
