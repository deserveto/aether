import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { validateUrl, safeFetch } from '../security/ssrf.js'
import { ErrorCode } from '@aether/shared'

describe('SSRF Protection', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ALLOW_LOCAL_ENDPOINTS = 'false'
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  describe('validateUrl', () => {
    it('rejects invalid URL format', async () => {
      await expect(validateUrl('not-a-url')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.INVALID_INPUT,
        }),
      )
    })

    it('rejects loopback and private IPs', async () => {
      await expect(validateUrl('http://127.0.0.1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
        }),
      )
      await expect(validateUrl('http://192.168.1.1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
        }),
      )
      await expect(validateUrl('http://localhost')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
        }),
      )
    })

    it('rejects URLs with credentials', async () => {
      await expect(validateUrl('https://user:pass@google.com')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
        }),
      )
    })

    it('allows public HTTPS URLs in production', async () => {
      const valid = await validateUrl('https://api.openai.com/v1')
      expect(valid).toBe('https://api.openai.com/v1')
    })

    it('rejects HTTP URLs in production', async () => {
      await expect(validateUrl('http://api.openai.com/v1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
          message: 'HTTPS protocol is required in production',
        }),
      )
    })

    it('allows HTTP URLs in development / non-production', async () => {
      process.env.NODE_ENV = 'development'
      const valid = await validateUrl('https://api.openai.com/v1')
      expect(valid).toBe('https://api.openai.com/v1')
    })

    it('allows loopback when ALLOW_LOCAL_ENDPOINTS is true', async () => {
      process.env.ALLOW_LOCAL_ENDPOINTS = 'true'
      const valid = await validateUrl('http://localhost:4000')
      expect(valid).toBe('http://localhost:4000/')
    })
  })

  describe('safeFetch', () => {
    it('fetches a valid URL successfully', async () => {
      const mockResponse = new Response('ok', { status: 200 })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

      const res = await safeFetch('https://api.openai.com/v1')
      expect(fetchSpy).toHaveBeenCalledWith('https://api.openai.com/v1', expect.any(Object))
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok')
    })

    it('enforces content-length limit (5MB check)', async () => {
      const mockHeaders = new Headers({
        'content-length': String(6 * 1024 * 1024), // 6MB
      })
      const mockResponse = new Response('too big', { status: 200, headers: mockHeaders })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

      await expect(safeFetch('https://api.openai.com/v1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.UNSUPPORTED_CONTENT,
          message: 'Response body exceeds size limit of 5MB',
        }),
      )
    })

    it('handles redirects and validates redirect destination', async () => {
      const redirectHeaders = new Headers({
        location: 'https://api.openai.com/v2',
      })
      const redirectResponse = new Response('', { status: 302, headers: redirectHeaders })
      const finalResponse = new Response('ok v2', { status: 200 })

      let callCount = 0
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        callCount++
        if (callCount === 1) {
          expect(url).toBe('https://api.openai.com/v1')
          return redirectResponse
        }
        expect(url).toBe('https://api.openai.com/v2')
        return finalResponse
      })

      const res = await safeFetch('https://api.openai.com/v1')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok v2')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('rejects redirect to blocked loopback IP', async () => {
      const redirectHeaders = new Headers({
        location: 'http://127.0.0.1/admin',
      })
      const redirectResponse = new Response('', { status: 302, headers: redirectHeaders })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectResponse)

      await expect(safeFetch('https://api.openai.com/v1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.PERMISSION_DENIED,
        }),
      )
    })

    it('prevents infinite redirect loops', async () => {
      const redirectHeaders = new Headers({
        location: 'https://api.openai.com/v1',
      })
      const redirectResponse = new Response('', { status: 302, headers: redirectHeaders })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectResponse)

      await expect(safeFetch('https://api.openai.com/v1')).rejects.toThrowError(
        expect.objectContaining({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Too many redirects',
        }),
      )
    })
  })
})
