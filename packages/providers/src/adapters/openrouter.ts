import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderAdapter } from './base.js'
import type {
  ProviderType,
  ConnectionValidationResult,
  DiscoveredModel,
  ProviderHealthResult,
  ModelProfile,
} from '../types.js'
import type { LanguageModelV1 } from '@ai-sdk/provider'

export class OpenRouterAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openrouter'
  private readonly defaultBaseUrl = 'https://openrouter.ai/api/v1'

  async validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ConnectionValidationResult> {
    const start = Date.now()
    try {
      const client = createOpenAI({
        apiKey,
        baseURL: baseUrl || this.defaultBaseUrl,
        headers: {
          'HTTP-Referer': 'https://aether-agent-gateway.dev',
          'X-Title': 'Aether Gateway',
          ...extraHeaders,
        },
      })
      const model = client('meta-llama/llama-3.2-1b-instruct:free')
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
      })
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, errorCode: 'AUTH_FAILED', message }
    }
  }

  async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
    void baseUrl
    void apiKey
    return [
      {
        modelId: 'meta-llama/llama-3.2-1b-instruct:free',
        displayName: 'Llama 3.2 1B Instruct (Free)',
        capabilities: {
          streaming: true,
          toolCalling: true,
          structuredOutput: false,
          vision: false,
          fileInput: false,
          reasoning: false,
        },
      },
    ]
  }

  async resolveModel(
    baseUrl: string | undefined,
    apiKey: string,
    profile: ModelProfile,
    extraHeaders?: Record<string, string>,
  ): Promise<LanguageModelV1> {
    const client = createOpenAI({
      apiKey,
      baseURL: baseUrl || this.defaultBaseUrl,
      headers: {
        'HTTP-Referer': 'https://aether-agent-gateway.dev',
        'X-Title': 'Aether Gateway',
        ...extraHeaders,
      },
    })
    return client(profile.modelId)
  }

  async healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult> {
    const res = await this.validateConnection(baseUrl, apiKey)
    if (res.ok) {
      return {
        status: 'healthy',
        ...(res.latencyMs !== undefined ? { latencyMs: res.latencyMs } : {}),
      }
    } else {
      return {
        status: 'unavailable',
        ...(res.message !== undefined ? { error: res.message } : {}),
      }
    }
  }
}
