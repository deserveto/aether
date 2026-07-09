import { AppError, ErrorCode } from '@aether/shared'
import { isPrivateIp } from './ssrf-guard.js'

export interface WebSearchInput {
  query: string
  limit?: number | undefined
  language?: string | undefined
  categories?: string[] | undefined
  timeRange?: 'day' | 'month' | 'year' | undefined
}

export interface NormalizedResult {
  title: string
  url: string
  snippet: string
  engine?: string | undefined
  rank: number
}

export interface SearchOutput {
  query: string
  results: NormalizedResult[]
  searchedAt: string
}

interface SearXNGResult {
  title: string
  url: string
  content?: string
  engine?: string
  score?: number
}

interface SearXNGResponse {
  query: string
  results: SearXNGResult[]
}

function isSafeResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
    if (isPrivateIp(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

export async function searchSearXNG(
  baseUrl: string,
  input: WebSearchInput,
  signal?: AbortSignal,
): Promise<SearchOutput> {
  const limit = input.limit ?? 10
  const params = new URLSearchParams({ q: input.query, format: 'json' })
  if (input.language) params.set('language', input.language)
  if (input.categories?.length) params.set('categories', input.categories.join(','))
  if (input.timeRange) params.set('time_range', input.timeRange)

  const url = `${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`

  let response: Response
  try {
    response = await fetch(url, signal != null ? { signal } : {})
  } catch (cause) {
    throw new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: 'Failed to reach SearXNG',
      retryable: true,
      cause,
    })
  }

  if (!response.ok) {
    throw new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: `SearXNG returned ${response.status} ${response.statusText}`,
      retryable: response.status >= 500,
    })
  }

  const data = (await response.json()) as SearXNGResponse

  const safeResults = data.results
    .filter((r) => isSafeResultUrl(r.url))
    .slice(0, limit)
    .map((r, i): NormalizedResult => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? '',
      ...(r.engine != null ? { engine: r.engine } : {}),
      rank: i + 1,
    }))

  return {
    query: input.query,
    results: safeResults,
    searchedAt: new Date().toISOString(),
  }
}
