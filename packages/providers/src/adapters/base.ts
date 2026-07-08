import type {
  ProviderType,
  ConnectionValidationResult,
  DiscoveredModel,
  ProviderHealthResult,
  ModelProfile,
} from '../types.js'
import type { LanguageModelV1 } from '@ai-sdk/provider'

export interface ProviderAdapter {
  readonly type: ProviderType

  validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ConnectionValidationResult>

  listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]>

  resolveModel(
    baseUrl: string | undefined,
    apiKey: string,
    profile: ModelProfile,
    extraHeaders?: Record<string, string>,
  ): Promise<LanguageModelV1>

  healthCheck(baseUrl: string | undefined, apiKey: string): Promise<ProviderHealthResult>
}
