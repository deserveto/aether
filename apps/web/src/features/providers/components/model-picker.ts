import type { DiscoveredModel } from '../provider-api'

export function formatModelOptionLabel(model: Pick<DiscoveredModel, 'displayName' | 'modelId'>) {
  return `${model.displayName} - ${model.modelId}`
}

export function filterDiscoveredModels(
  models: readonly DiscoveredModel[],
  query: string,
): readonly DiscoveredModel[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return models

  return models.filter((model) => {
    const displayName = model.displayName.toLowerCase()
    const modelId = model.modelId.toLowerCase()
    return displayName.includes(normalizedQuery) || modelId.includes(normalizedQuery)
  })
}

export function moveModelActiveIndex(
  currentIndex: number,
  direction: 1 | -1,
  optionCount: number,
) {
  if (optionCount <= 0) return -1
  if (currentIndex < 0) return direction === 1 ? 0 : optionCount - 1
  return (currentIndex + direction + optionCount) % optionCount
}
