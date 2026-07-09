import { describe, expect, it } from 'vitest'
import {
  filterDiscoveredModels,
  formatModelOptionLabel,
  moveModelActiveIndex,
} from '../model-picker'

const capabilities = {
  streaming: true,
  toolCalling: false,
  structuredOutput: false,
  vision: false,
  fileInput: false,
  reasoning: false,
}

const models = [
  {
    modelId: 'openrouter/deepseek/deepseek-r1-0528:free',
    displayName: 'DeepSeek R1 0528 Free With Very Long Provider Name',
    capabilities,
  },
  {
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    capabilities,
  },
  {
    modelId: 'claude-4-sonnet',
    displayName: 'Claude Sonnet 4',
    capabilities,
  },
] as const

describe('model picker helpers', () => {
  it('formats a readable label from display name and model id', () => {
    expect(formatModelOptionLabel(models[1])).toBe('GPT-4o mini - gpt-4o-mini')
  })

  it('filters models by display name case-insensitively', () => {
    expect(filterDiscoveredModels(models, 'deepseek')).toEqual([models[0]])
  })

  it('filters models by model id case-insensitively', () => {
    expect(filterDiscoveredModels(models, '4O-MINI')).toEqual([models[1]])
  })

  it('returns all models for an empty query', () => {
    expect(filterDiscoveredModels(models, '   ')).toEqual(models)
  })

  it('wraps active index movement through available options', () => {
    expect(moveModelActiveIndex(-1, 1, 3)).toBe(0)
    expect(moveModelActiveIndex(2, 1, 3)).toBe(0)
    expect(moveModelActiveIndex(0, -1, 3)).toBe(2)
    expect(moveModelActiveIndex(0, 1, 0)).toBe(-1)
  })
})
