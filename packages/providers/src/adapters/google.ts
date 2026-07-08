import { createGoogleGenerativeAI } from '@ai-sdk/google'
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

interface GeminiModel {
  readonly name: string
  readonly displayName?: string
  readonly supportedGenerationMethods?: readonly string[]
}
interface GeminiModelsResponse {
  readonly models?: readonly GeminiModel[]
}

export class GoogleAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'google'
  private readonly defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta'

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
      const client = createGoogleGenerativeAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(baseUrl ? { fetch: providerFetch } : {}),
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      })
      const model = client('gemini-1.5-flash')
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
    const endpoint = `${base}/models?key=${encodeURIComponent(apiKey)}`
    const response = await safeFetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Model discovery failed with status ${response.status}`)
    }
    const body = (await response.json()) as GeminiModelsResponse
    const items = body.models ?? []
    return items
      .filter((item): item is GeminiModel => Boolean(item?.name))
      .map((item) => {
        const modelId = item.name.replace(/^models\//, '')
        const methods = (item.supportedGenerationMethods ?? []).map((m) => m.toLowerCase())
        const hints = {
          streaming: methods.includes('streamgeneratecontent'),
        }
        return {
          modelId,
          displayName: item.displayName ?? prettifyModelId(modelId),
          capabilities: inferCapabilities(modelId, item.displayName, hints),
        }
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
    const client = createGoogleGenerativeAI({
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
