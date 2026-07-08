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
import { validateUrl, providerFetch, safeFetch } from '../security/ssrf.js'
import { inferCapabilities, prettifyModelId } from './discovery.js'

interface AnthropicModel {
  readonly id: string
  readonly display_name?: string
}
interface AnthropicModelsResponse {
  readonly data?: readonly AnthropicModel[]
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'anthropic'
  private readonly defaultBaseUrl = 'https://api.anthropic.com/v1'
  private readonly anthropicVersion = '2023-06-01'

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
    const base = (baseUrl ?? this.defaultBaseUrl).replace(/\/$/, '')
    await validateUrl(base)
    const response = await safeFetch(`${base}/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': this.anthropicVersion,
        Accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`Model discovery failed with status ${response.status}`)
    }
    const body = (await response.json()) as AnthropicModelsResponse
    const items = body.data ?? []
    return items
      .filter((item): item is AnthropicModel => Boolean(item?.id))
      .map((item) => ({
        modelId: item.id,
        displayName: item.display_name ?? prettifyModelId(item.id),
        capabilities: inferCapabilities(item.id, item.display_name),
      }))
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
