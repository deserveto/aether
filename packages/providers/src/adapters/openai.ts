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

export class OpenAIAdapter implements ProviderAdapter {
  readonly type: ProviderType = 'openai'

  async validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ConnectionValidationResult> {
    const start = Date.now()
    try {
      const client = createOpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
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
    void baseUrl
    void apiKey
    return [
      {
        modelId: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
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
      {
        modelId: 'o1-mini',
        displayName: 'o1 Mini',
        capabilities: {
          streaming: true,
          toolCalling: true,
          structuredOutput: true,
          vision: false,
          fileInput: false,
          reasoning: true,
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
      ...(baseUrl ? { baseURL: baseUrl } : {}),
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
