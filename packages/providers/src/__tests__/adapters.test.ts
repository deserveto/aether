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

const mockSafeFetch = vi.fn()
const globalWithMock = globalThis as typeof globalThis & {
  __mockSafeFetch?: (...args: unknown[]) => Promise<unknown>
}
globalWithMock.__mockSafeFetch = mockSafeFetch

vi.mock('../security/ssrf.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../security/ssrf.js')>()
  const globalWithMockInside = globalThis as typeof globalThis & {
    __mockSafeFetch?: (...args: unknown[]) => Promise<unknown>
  }
  return {
    ...original,
    safeFetch: vi.fn().mockImplementation((...args: unknown[]) => {
      return globalWithMockInside.__mockSafeFetch!(...args)
    }),
    providerFetch: vi.fn().mockImplementation((
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1]
    ) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as { url: string }).url
      return globalWithMockInside.__mockSafeFetch!(url, init)
    }),
  }
})

describe('Provider Adapters', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ALLOW_LOCAL_ENDPOINTS = 'true'
    vi.clearAllMocks()
    mockOpenAIDoGenerate.mockReset()
    mockAnthropicDoGenerate.mockReset()
    mockGoogleDoGenerate.mockReset()
    mockSafeFetch.mockReset()
    mockSafeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
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
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-4o-mini' },
            { id: 'gpt-4o' },
            { id: 'text-embedding-3-small' },
          ],
        }),
      })
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(3)
      expect(models[0]!.modelId).toBe('gpt-4o-mini')
      expect(models[0]!.capabilities.vision).toBe(true)
      expect(models[1]!.modelId).toBe('gpt-4o')
      expect(models[2]!.modelId).toBe('text-embedding-3-small')
      expect(models[2]!.capabilities.streaming).toBe(false)
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({ method: 'GET' }),
      )
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
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'claude-3-5-sonnet-latest', display_name: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-5-haiku-latest', display_name: 'Claude 3.5 Haiku' },
          ],
        }),
      })
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(2)
      expect(models[0]!.modelId).toBe('claude-3-5-sonnet-latest')
      expect(models[0]!.displayName).toBe('Claude 3.5 Sonnet')
      expect(models[0]!.capabilities.vision).toBe(true)
      expect(models[1]!.modelId).toBe('claude-3-5-haiku-latest')
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      )
    })

    it('validates connection successfully', async () => {
      mockAnthropicDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection('https://custom.anthropic.com', 'test-key')
      expect(res.ok).toBe(true)
      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://custom.anthropic.com',
        fetch: expect.any(Function),
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
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-1.5-pro',
              displayName: 'Gemini 1.5 Pro',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
            },
            {
              name: 'models/embedding-001',
              displayName: 'Embedding 001',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
      })
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(2)
      expect(models[0]!.modelId).toBe('gemini-1.5-pro')
      expect(models[0]!.displayName).toBe('Gemini 1.5 Pro')
      expect(models[0]!.capabilities.streaming).toBe(true)
      expect(models[0]!.capabilities.vision).toBe(true)
      expect(models[1]!.modelId).toBe('embedding-001')
      expect(models[1]!.capabilities.streaming).toBe(false)
      expect(mockSafeFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models?key='),
        expect.objectContaining({ method: 'GET' }),
      )
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
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'anthropic/claude-3.5-sonnet',
              name: 'Anthropic: Claude 3.5 Sonnet',
              architecture: { input_modalities: ['text', 'image'] },
              supported_parameters: ['tools', 'stream', 'json_schema'],
            },
            {
              id: 'meta-llama/llama-3.2-1b-instruct:free',
              name: 'Llama 3.2 1B Instruct (Free)',
              architecture: { input_modalities: ['text'] },
              supported_parameters: ['stream'],
            },
          ],
        }),
      })
      const models = await adapter.listModels(undefined, 'test-key')
      expect(models).toHaveLength(2)
      expect(models[0]!.modelId).toBe('anthropic/claude-3.5-sonnet')
      expect(models[0]!.capabilities.vision).toBe(true)
      expect(models[0]!.capabilities.toolCalling).toBe(true)
      expect(models[0]!.capabilities.structuredOutput).toBe(true)
      expect(models[1]!.modelId).toBe('meta-llama/llama-3.2-1b-instruct:free')
      expect(models[1]!.capabilities.vision).toBe(false)
      expect(models[1]!.capabilities.toolCalling).toBe(false)
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'HTTP-Referer': 'https://aether-agent-gateway.dev',
            'X-Title': 'Aether Gateway',
          }),
        }),
      )
    })

    it('validates connection successfully with defaults and headers', async () => {
      mockOpenAIDoGenerate.mockResolvedValue({ text: 'pong' })
      const res = await adapter.validateConnection(undefined, 'test-key', { 'X-Custom': 'header' })
      expect(res.ok).toBe(true)
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        fetch: expect.any(Function),
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
        fetch: expect.any(Function),
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

    it('lists models from the custom endpoint', async () => {
      mockSafeFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'custom-model' }, { id: 'custom-model-vision' }] }),
      })
      const models = await adapter.listModels('https://my-custom-endpoint.com/v1', 'test-key')
      expect(models).toHaveLength(2)
      expect(models[0]!.modelId).toBe('custom-model')
      expect(models[1]!.modelId).toBe('custom-model-vision')
      expect(mockSafeFetch).toHaveBeenCalledWith(
        'https://my-custom-endpoint.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        }),
      )
    })

    it('fails listModels if no baseURL provided', async () => {
      await expect(adapter.listModels(undefined, 'test-key')).rejects.toThrowError(
        'base_url is required for custom compatible provider',
      )
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
        fetch: expect.any(Function),
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
        fetch: expect.any(Function),
        headers: undefined,
      })
      expect(mockOpenAIClient).toHaveBeenCalledWith('custom-model')
    })

    describe('SSRF and Integration validation scenarios', () => {
      it('rejects private IPs in CompatibleAdapter and standard adapters when using custom baseUrl', async () => {
        process.env.ALLOW_LOCAL_ENDPOINTS = 'false'
        
        const compatibleAdapter = new CompatibleAdapter()
        const resCompatible = await compatibleAdapter.validateConnection(
          'http://127.0.0.1/v1',
          'test-key',
        )
        expect(resCompatible.ok).toBe(false)
        expect(resCompatible.message).toContain('Endpoint resolved to blocked IP')

        const openAIAdapter = new OpenAIAdapter()
        const resOpenAI = await openAIAdapter.validateConnection(
          'http://127.0.0.1/v1',
          'test-key',
        )
        expect(resOpenAI.ok).toBe(false)
        expect(resOpenAI.message).toContain('Endpoint resolved to blocked IP')

        const anthropicAdapter = new AnthropicAdapter()
        const resAnthropic = await anthropicAdapter.validateConnection(
          'http://127.0.0.1/v1',
          'test-key',
        )
        expect(resAnthropic.ok).toBe(false)
        expect(resAnthropic.message).toContain('Endpoint resolved to blocked IP')
      })

      it('handles valid and invalid response mocking from custom compatible /models endpoint during validation', async () => {
        const adapter = new CompatibleAdapter()

        // 1. Mocking valid response
        mockSafeFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({}),
        })
        const resOk = await adapter.validateConnection('https://custom.endpoint.com/v1', 'test-key')
        expect(resOk.ok).toBe(true)

        // 2. Mocking invalid response (e.g. 401 Unauthorized)
        mockSafeFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        })
        const resErr = await adapter.validateConnection('https://custom.endpoint.com/v1', 'test-key')
        expect(resErr.ok).toBe(false)
        expect(resErr.errorCode).toBe('CONNECTION_FAILED')
        expect(resErr.message).toContain('Connection failed with status: 401')
      })

      it('handles OpenRouter validation model fallback when free model check fails', async () => {
        const adapter = new OpenRouterAdapter()
        // Mock generate failing (e.g., rate limit / free model down)
        mockOpenAIDoGenerate.mockRejectedValueOnce(new Error('Rate limit exceeded for free model'))
        
        // Mock safeFetch succeeding for direct check to models endpoint
        mockSafeFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({}),
        })

        const res = await adapter.validateConnection(undefined, 'test-key')
        expect(res.ok).toBe(true)
        expect(mockSafeFetch).toHaveBeenCalledWith(
          'https://openrouter.ai/api/v1/models',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-key',
            }),
          }),
        )
      })
    })
  })
})
