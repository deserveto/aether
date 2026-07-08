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
import { validateUrl, providerFetch } from '../security/ssrf.js'
import { listOpenAICompatibleModels } from './discovery.js'

export class OpenAIAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai'
  private readonly defaultBaseUrl = 'https://api.openai.com/v1'

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
      const client = createOpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(baseUrl ? { fetch: providerFetch } : {}),
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      })
      const model = client('gpt-4o-mini')
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
    if (baseUrl) {
      await validateUrl(baseUrl)
    }
    return listOpenAICompatibleModels({
      baseUrl,
      apiKey,
      defaultBaseUrl: this.defaultBaseUrl,
    })
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
    const client = createOpenAI({
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
