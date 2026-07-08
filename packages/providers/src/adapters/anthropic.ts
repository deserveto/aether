import { createAnthropic } from '@ai-sdk/anthropic'
import type { ProviderAdapter } from './base.js'
import type {
  ProviderType,
  ConnectionValidationResult,
  DiscoveredModel,
  ProviderHealthResult,
  ModelProfile,
} from '../types.js'
import type { LanguageModelV1 } from '@ai-sdk/provider'
import { validateUrl, providerFetch } from '../security/ssrf.js'

export class AnthropicAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'anthropic'

  async validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ConnectionValidationResult> {
    const start = Date.now()
    try {
      if (baseUrl) {
        await validateUrl(baseUrl)
      }
      const client = createAnthropic({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(baseUrl ? { fetch: providerFetch } : {}),
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      })
      const model = client('claude-3-5-haiku-latest')
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
      },
      {
        modelId: 'claude-3-5-haiku-latest',
        displayName: 'Claude 3.5 Haiku',
        capabilities: {
          streaming: true,
          toolCalling: true,
          structuredOutput: true,
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
    if (baseUrl) {
      await validateUrl(baseUrl)
    }
    const client = createAnthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      ...(baseUrl ? { fetch: providerFetch } : {}),
      ...(extraHeaders ? { headers: extraHeaders } : {}),
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
