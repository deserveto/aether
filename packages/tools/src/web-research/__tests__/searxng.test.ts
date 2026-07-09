import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchSearXNG } from '../searxng.js'

const MOCK_RESPONSE = {
  query: 'test',
  results: [
    { title: 'Title One', url: 'https://example.com/1', content: 'Snippet one', engine: 'google', score: 0.9 },
    { title: 'Title Two', url: 'https://example.com/2', content: 'Snippet two', engine: 'bing', score: 0.7 },
    // Bad scheme — should be filtered
    { title: 'Bad', url: 'javascript:alert(1)', content: 'bad', engine: 'x', score: 0.1 },
    // Private IP — should be filtered
    { title: 'Private', url: 'http://192.168.1.1/page', content: 'private', engine: 'x', score: 0.1 },
  ],
}

describe('searchSearXNG', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      }),
    )
  })

  it('calls SearXNG JSON endpoint with correct params', async () => {
    await searchSearXNG('http://localhost:8080', { query: 'test', limit: 5 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/search?')
    expect(url).toContain('format=json')
    expect(url).toContain('q=test')
  })

  it('returns normalized results excluding invalid/private URLs', async () => {
    const output = await searchSearXNG('http://localhost:8080', { query: 'test', limit: 10 })
    expect(output.query).toBe('test')
    expect(output.results).toHaveLength(2)
    expect(output.results[0]).toMatchObject({ title: 'Title One', url: 'https://example.com/1', rank: 1 })
    expect(output.results[1]).toMatchObject({ title: 'Title Two', url: 'https://example.com/2', rank: 2 })
  })

  it('respects limit', async () => {
    const output = await searchSearXNG('http://localhost:8080', { query: 'test', limit: 1 })
    expect(output.results).toHaveLength(1)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Error' }),
    )
    await expect(searchSearXNG('http://localhost:8080', { query: 'test' })).rejects.toThrow()
  })
})
