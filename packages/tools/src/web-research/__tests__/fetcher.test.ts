import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchUrl } from '../fetcher.js'
import { AppError } from '@aether/shared'

const HTML_RESPONSE = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body><h1>Hello</h1><p>This is content.</p></body>
</html>`

function makeMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    url: 'https://example.com/page',
    headers: {
      get: (h: string) => (h === 'content-type' ? 'text/html; charset=utf-8' : null),
    },
    arrayBuffer: () => Promise.resolve(Buffer.from(HTML_RESPONSE).buffer as ArrayBuffer),
    ...overrides,
  }
}

describe('fetchUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeMockResponse()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns extracted content from HTML page', async () => {
    const result = await fetchUrl({ url: 'https://example.com/page' })
    expect(result.url).toBe('https://example.com/page')
    expect(result.finalUrl).toBe('https://example.com/page')
    expect(result.title).toBe('Test Page')
    expect(result.content).toContain('Hello')
    expect(result.content).toContain('This is content.')
    expect(result.contentType).toContain('text/html')
    expect(result.truncated).toBe(false)
  })

  it('truncates content when it exceeds maxCharacters', async () => {
    const result = await fetchUrl({ url: 'https://example.com/page', maxCharacters: 5 })
    expect(result.content.length).toBeLessThanOrEqual(5)
    expect(result.truncated).toBe(true)
  })

  it('throws PERMISSION_DENIED for private IP URLs', async () => {
    await expect(fetchUrl({ url: 'http://192.168.1.1/page' })).rejects.toThrow(AppError)
  })

  it('throws INVALID_INPUT for non-http scheme', async () => {
    await expect(fetchUrl({ url: 'file:///etc/passwd' })).rejects.toThrow(AppError)
  })

  it('throws UNSUPPORTED_CONTENT on disallowed content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeMockResponse({
          url: 'https://example.com/file.pdf',
          headers: {
            get: (h: string) => (h === 'content-type' ? 'application/pdf' : null),
          },
          arrayBuffer: () => Promise.resolve(Buffer.from('%PDF').buffer as ArrayBuffer),
        }),
      ),
    )
    await expect(fetchUrl({ url: 'https://example.com/file.pdf' })).rejects.toThrow(AppError)
  })

  it('revalidates IP after redirect by checking response.url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeMockResponse({
          url: 'http://192.168.1.1/evil',
        }),
      ),
    )
    await expect(fetchUrl({ url: 'https://example.com/redirect' })).rejects.toThrow(AppError)
  })
})
