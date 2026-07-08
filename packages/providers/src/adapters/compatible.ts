import { createOpenAI } from '@ai-sdk/openai'
import type { ProviderAdapter } from './base.js'
import type {
  ProviderType,
  ConnectionValidationResult,
  DiscoveredModel,
  ProviderHealthResult,
  ModelProfile,
} from '../types.js'
import { validateUrl } from '../security/ssrf.js'
import type { LanguageModelV1 } from '@ai-sdk/provider'

export class CompatibleAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai-compatible'

  async validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ConnectionValidationResult> {
    if (!baseUrl) {
      return {
        ok: false,
        errorCode: 'INVALID_INPUT',
        message: 'base_url is required for custom compatible provider',
      }
    }
    const start = Date.now()
    try {
      await validateUrl(baseUrl)
      createOpenAI({
        apiKey,
        baseURL: baseUrl,
        ...(extraHeaders ? { headers: extraHeaders } : {}),
      })
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, errorCode: 'CONNECTION_FAILED', message }
    }
  }

  async listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]> {
    void baseUrl
    void apiKey
    return []
  }

  async resolveModel(
    baseUrl: string | undefined,
    apiKey: string,
    profile: ModelProfile,
    extraHeaders?: Record<string, string>,
  ): Promise<LanguageModelV1> {
    if (!baseUrl) {
      throw new Error('base_url is required for custom compatible provider')
    }
    await validateUrl(baseUrl)
    const client = createOpenAI({
      apiKey,
      baseURL: baseUrl,
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
