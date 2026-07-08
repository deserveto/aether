import { OpenAIAdapter } from './openai.js'
import { AnthropicAdapter } from './anthropic.js'
import { GoogleAdapter } from './google.js'
import { OpenRouterAdapter } from './openrouter.js'
import { CompatibleAdapter } from './compatible.js'
import type { ProviderAdapter } from './base.js'
import type { ProviderType } from '../types.js'

const adapters: Record<ProviderType, ProviderAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  openrouter: new OpenRouterAdapter(),
  'openai-compatible': new CompatibleAdapter(),
}

export function getAdapter(type: ProviderType): ProviderAdapter {
  const adapter = adapters[type]
  if (!adapter) {
    throw new Error(`Unsupported provider type: ${type}`)
  }
  return adapter
}
