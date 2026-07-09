import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuiltInAgentDeclaration } from '@aether/agents'
import { resolveAgent, resolveCatalog, type AgentRuntimeDeps, type StoredAgentRow } from '../agents/resolver.js'

const manifest = {
  id: 'qa-web-agent',
  name: 'QA Web Agent',
  description: 'd',
  category: 'qa',
  source: 'code',
  status: 'published',
  protected: true,
  capabilities: [],
  toolIds: [],
  modelBinding: null,
  memory: { enabled: true, mode: 'thread' },
  visibility: 'internal',
  createdAt: 't',
  updatedAt: 't',
} as const

function deps(overrides: Partial<AgentRuntimeDeps> = {}): AgentRuntimeDeps {
  return {
    listBuiltIn: (): readonly BuiltInAgentDeclaration[] => [
      { manifest, instructions: 'do things' },
    ],
    findBinding: vi.fn(async () => undefined),
    findProfile: vi.fn(async () => undefined),
    findConnection: vi.fn(async () => undefined),
    listStoredAgents: vi.fn(async () => []),
    findStoredAgent: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('agent resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports built-in agents as not configured when no binding exists', async () => {
    const catalog = await resolveCatalog(deps())
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.configured).toBe(false)
  })

  it('reports configured when a usable binding + approved profile + enabled connection exist', async () => {
    const d = deps({
      findBinding: vi.fn(async () => ({
        agentId: 'qa-web-agent',
        primaryModelProfileId: 'p1',
        fallbackModelProfileIds: [],
        createdAt: 't',
        updatedAt: 't',
      })),
      findProfile: vi.fn(async () => ({
        id: 'p1',
        providerConnectionId: 'c1',
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
        defaultSettings: null,
        createdAt: 't',
        updatedAt: 't',
      })),
      findConnection: vi.fn(async () => ({
        id: 'c1',
        name: 'OpenAI',
        type: 'openai' as const,
        baseUrl: null,
        secretRef: 'env:OPENAI_API_KEY',
        enabled: true,
        status: 'healthy',
        createdAt: 't',
        updatedAt: 't',
      })),
    })
    const catalog = await resolveCatalog(d)
    expect(catalog[0]?.configured).toBe(true)
  })

  it('reports not configured when the bound profile is not approved', async () => {
    const d = deps({
      findBinding: vi.fn(async () => ({
        agentId: 'qa-web-agent',
        primaryModelProfileId: 'p1',
        fallbackModelProfileIds: [],
        createdAt: 't',
        updatedAt: 't',
      })),
      findProfile: vi.fn(async () => ({
        id: 'p1',
        providerConnectionId: 'c1',
        modelId: 'm',
        displayName: 'M',
        capabilities: {},
        approved: false,
        enabled: true,
        defaultSettings: null,
        createdAt: 't',
        updatedAt: 't',
      })),
      findConnection: vi.fn(async () => ({
        id: 'c1',
        name: 'OpenAI',
        type: 'openai' as const,
        baseUrl: null,
        secretRef: 'env:X',
        enabled: true,
        status: 'healthy',
        createdAt: 't',
        updatedAt: 't',
      })),
    })
    const catalog = await resolveCatalog(d)
    expect(catalog[0]?.configured).toBe(false)
  })

  it('returns null for unknown agents', async () => {
    expect(await resolveAgent(deps(), 'nope')).toBeNull()
  })

  it('resolves published stored agents and lists them in catalog', async () => {
    const storedRow: StoredAgentRow = {
      id: 'custom-agent',
      status: 'published',
      name: 'Custom Agent',
      description: 'Custom agent description',
      instructions: 'Custom instructions',
      category: 'custom',
      capabilities: ['cap-1'],
      toolIds: ['tool-1'],
      primaryModelProfileId: 'p1',
      fallbackModelProfileIds: [],
      memoryEnabled: true,
      memoryMode: 'thread',
      visibility: 'public',
      createdAt: 't',
      updatedAt: 't',
    }

    const d = deps({
      listStoredAgents: vi.fn(async () => [storedRow]),
      findStoredAgent: vi.fn(async (id) => (id === 'custom-agent' ? storedRow : undefined)),
      findProfile: vi.fn(async () => ({
        id: 'p1',
        providerConnectionId: 'c1',
        modelId: 'm',
        displayName: 'M',
        capabilities: {},
        approved: true,
        enabled: true,
        defaultSettings: null,
        createdAt: 't',
        updatedAt: 't',
      })),
      findConnection: vi.fn(async () => ({
        id: 'c1',
        name: 'OpenAI',
        type: 'openai' as const,
        baseUrl: null,
        secretRef: 'env:X',
        enabled: true,
        status: 'healthy',
        createdAt: 't',
        updatedAt: 't',
      })),
    })

    const catalog = await resolveCatalog(d)
    expect(catalog).toHaveLength(2) // 1 built-in + 1 stored
    expect(catalog[1]?.manifest.id).toBe('custom-agent')
    expect(catalog[1]?.configured).toBe(true)

    const resolved = await resolveAgent(d, 'custom-agent')
    expect(resolved?.manifest.name).toBe('Custom Agent')
    expect(resolved?.configured).toBe(true)
  })
})
