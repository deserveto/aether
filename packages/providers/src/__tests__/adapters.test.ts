import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getAdapter } from '../adapters/index.js'
import { OpenAIAdapter } from '../adapters/openai.js'
import { AnthropicAdapter } from '../adapters/anthropic.js'
import { GoogleAdapter } from '../adapters/google.js'
import { OpenRouterAdapter } from '../adapters/openrouter.js'
import { CompatibleAdapter } from '../adapters/compatible.js'
import type { ProviderType } from '../types.js'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Mocking provider client functions and doGenerate
const mockOpenAIDoGenerate = vi.fn()
const mockOpenAIClient = vi.fn().mockReturnValue({
  doGenerate: mockOpenAIDoGenerate,
})
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockImplementation(() => mockOpenAIClient),
}))

const mockAnthropicDoGenerate = vi.fn()
const mockAnthropicClient = vi.fn().mockReturnValue({
  doGenerate: mockAnthropicDoGenerate,
})
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockImplementation(() => mockAnthropicClient),
}))

const mockGoogleDoGenerate = vi.fn()
const mockGoogleClient = vi.fn().mockReturnValue({
  doGenerate: mockGoogleDoGenerate,
})
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn().mockImplementation(() => mockGoogleClient),
}))

describe('Provider Adapters', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ALLOW_LOCAL_ENDPOINTS = 'true'
    vi.clearAllMocks()
    mockOpenAIDoGenerate.mockReset()
    mockAnthropicDoGenerate.mockReset()
    mockGoogleDoGenerate.mockReset()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('getAdapter Factory', () => {
    it('returns the correct adapter for each ProviderType', () => {
      expect(getAdapter('openai')).toBeInstanceOf(OpenAIAdapter)
      expect(getAdapter('anthropic')).toBeInstanceOf(AnthropicAdapter)
      expect(getAdapter('google')).toBeInstanceOf(GoogleAdapter)
      expect(getAdapter('openrouter')).toBeInstanceOf(OpenRouterAdapter)
      expect(getAdapter('openai-compatible')).toBeInstanceOf(CompatibleAdapter)
    })

    it('throws an error for unsupported provider types', () => {
      expect(() => getAdapter('invalid' as unknown as ProviderType)).toThrowError(
        'Unsupported provider type: invalid',
      )
    })
  })

  describe('OpenAIAdapter', () => {
    const adapter = new OpenAIAdapter()

    it('returns openai as type', () => {
      expect(adapter.type).toBe('openai')
    })

    it('lists correct models', async () => {
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(3)
      expect(models[0]!.modelId).toBe('gpt-4o-mini')
      expect(models[1]!.modelId).toBe('gpt-4o')
      expect(models[2]!.modelId).toBe('o1-mini')
    })

    it('validates connection successfully', async () => {
      mockOpenAIDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection(undefined, 'test-key')
      expect(res.ok).toBe(true)
      expect(res.latencyMs).toBeGreaterThanOrEqual(0)
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: undefined,
        headers: undefined,
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('gpt-4o-mini')
    })

    it('returns error code and message on connection failure', async () => {
      mockOpenAIDoGenerate.mockRejectedValue(new Error('Invalid API Key'))
      const res = await adapter.validateConnection(undefined, 'test-key')
      expect(res.ok).toBe(false)
      expect(res.errorCode).toBe('AUTH_FAILED')
      expect(res.message).toBe('Invalid API Key')
    })

    it('resolves model successfully', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
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
      }
      const model = await adapter.resolveModel(undefined, 'test-key', profile)
      expect(model).toBeDefined()
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: undefined,
        headers: undefined,
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('gpt-4o')
    })

    it('checks health successfully', async () => {
      mockOpenAIDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.healthCheck(undefined, 'test-key')
      expect(res.status).toBe('healthy')
      expect(res.latencyMs).toBeDefined()
    })

    it('reports degraded/unavailable health on check failure', async () => {
      mockOpenAIDoGenerate.mockRejectedValue(new Error('Network error'))
      const res = await adapter.healthCheck(undefined, 'test-key')
      expect(res.status).toBe('unavailable')
      expect(res.error).toBe('Network error')
    })
  })

  describe('AnthropicAdapter', () => {
    const adapter = new AnthropicAdapter()

    it('returns anthropic as type', () => {
      expect(adapter.type).toBe('anthropic')
    })

    it('lists correct models', async () => {
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(2)
      expect(models[0]!.modelId).toBe('claude-3-5-sonnet-latest')
      expect(models[1]!.modelId).toBe('claude-3-5-haiku-latest')
    })

    it('validates connection successfully', async () => {
      mockAnthropicDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection('https://custom.anthropic.com', 'test-key')
      expect(res.ok).toBe(true)
      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://custom.anthropic.com',
        headers: undefined,
      })
      expect(mockAnthropicClient).toHaveBeenCalledWith('claude-3-5-haiku-latest')
    })

    it('resolves model successfully', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
        modelId: 'claude-3-5-sonnet-latest',
        displayName: 'Claude 3.5 Sonnet',
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
      }
      const model = await adapter.resolveModel(undefined, 'test-key', profile)
      expect(model).toBeDefined()
      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: undefined,
        headers: undefined,
      })
      expect(mockAnthropicClient).toHaveBeenCalledWith('claude-3-5-sonnet-latest')
    })
  })

  describe('GoogleAdapter', () => {
    const adapter = new GoogleAdapter()

    it('returns google as type', () => {
      expect(adapter.type).toBe('google')
    })

    it('lists correct models', async () => {
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(3)
      expect(models[0]!.modelId).toBe('gemini-1.5-flash')
      expect(models[1]!.modelId).toBe('gemini-1.5-pro')
      expect(models[2]!.modelId).toBe('gemini-2.0-flash-exp')
    })

    it('validates connection successfully', async () => {
      mockGoogleDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection(undefined, 'test-key')
      expect(res.ok).toBe(true)
      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: undefined,
        headers: undefined,
      })
      expect(mockGoogleClient).toHaveBeenCalledWith('gemini-1.5-flash')
    })

    it('resolves model successfully', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
        modelId: 'gemini-1.5-pro',
        displayName: 'Gemini 1.5 Pro',
        capabilities: {
          streaming: true,
          toolCalling: true,
          structuredOutput: true,
          vision: true,
          fileInput: true,
          reasoning: false,
        },
        approved: true,
        enabled: true,
      }
      const model = await adapter.resolveModel(undefined, 'test-key', profile)
      expect(model).toBeDefined()
      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: undefined,
        headers: undefined,
      })
      expect(mockGoogleClient).toHaveBeenCalledWith('gemini-1.5-pro')
    })
  })

  describe('OpenRouterAdapter', () => {
    const adapter = new OpenRouterAdapter()

    it('returns openrouter as type', () => {
      expect(adapter.type).toBe('openrouter')
    })

    it('lists correct models', async () => {
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(1)
      expect(models[0]!.modelId).toBe('meta-llama/llama-3.2-1b-instruct:free')
    })

    it('validates connection successfully with defaults and headers', async () => {
      mockOpenAIDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection(undefined, 'test-key', { 'X-Custom': 'header' })
      expect(res.ok).toBe(true)
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://aether-agent-gateway.dev',
          'X-Title': 'Aether Gateway',
          'X-Custom': 'header',
        },
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('meta-llama/llama-3.2-1b-instruct:free')
    })

    it('resolves model successfully', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
        modelId: 'meta-llama/llama-3.2-1b-instruct:free',
        displayName: 'Llama 3.2',
        capabilities: {
          streaming: true,
          toolCalling: true,
          structuredOutput: false,
          vision: false,
          fileInput: false,
          reasoning: false,
        },
        approved: true,
        enabled: true,
      }
      const model = await adapter.resolveModel(undefined, 'test-key', profile)
      expect(model).toBeDefined()
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://aether-agent-gateway.dev',
          'X-Title': 'Aether Gateway',
        },
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('meta-llama/llama-3.2-1b-instruct:free')
    })
  })

  describe('CompatibleAdapter', () => {
    const adapter = new CompatibleAdapter()

    it('returns openai-compatible as type', () => {
      expect(adapter.type).toBe('openai-compatible')
    })

    it('lists empty models', async () => {
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(0)
    })

    it('fails validateConnection if no baseURL provided', async () => {
      const res = await adapter.validateConnection(undefined, 'test-key')
      expect(res.ok).toBe(false)
      expect(res.errorCode).toBe('INVALID_INPUT')
    })

    it('validates connection successfully with base url', async () => {
      const res = await adapter.validateConnection(
        'https://my-custom-endpoint.com/v1',
        'test-key',
        { 'X-Header': 'custom' },
      )
      expect(res.ok).toBe(true)
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://my-custom-endpoint.com/v1',
        headers: { 'X-Header': 'custom' },
      })
    })

    it('fails resolveModel if no baseURL provided', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
        modelId: 'custom-model',
        displayName: 'Custom Model',
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
      }
      await expect(adapter.resolveModel(undefined, 'test-key', profile)).rejects.toThrowError(
        'base_url is required for custom compatible provider',
      )
    })

    it('resolves model successfully with base url', async () => {
      const profile = {
        id: 'test-profile-id',
        providerConnectionId: 'conn-id',
        modelId: 'custom-model',
        displayName: 'Custom Model',
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
      }
      const model = await adapter.resolveModel(
        'https://my-custom-endpoint.com/v1',
        'test-key',
        profile,
      )
      expect(model).toBeDefined()
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://my-custom-endpoint.com/v1',
        headers: undefined,
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('custom-model')
    })
  })
})
