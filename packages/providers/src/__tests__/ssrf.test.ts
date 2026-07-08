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

    it('rejects IPv4-mapped/translated IPv6 SSRF bypasses', async () => {
      // Loopback mapped addresses
      await expect(validateUrl('http://[::ffff:127.0.0.1]')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      )
      await expect(validateUrl('http://[::ffff:7f00:1]')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      )

      // Private network mapped addresses
      await expect(validateUrl('http://[::ffff:192.168.1.1]')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      )

      // Translated IPv6 addresses (rfc6145)
      await expect(validateUrl('http://[::ffff:0:127.0.0.1]')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      )
      await expect(validateUrl('http://[::ffff:0:192.168.1.1]')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
      )
    })

    it('strips sensitive headers on cross-origin redirect but preserves them on same-origin redirect', async () => {
      const crossRedirectHeaders = new Headers({
        location: 'https://google.com/v2',
      })
      const sameRedirectHeaders = new Headers({
        location: 'https://api.openai.com/v2',
      })

      const crossRedirectResponse = new Response('', { status: 302, headers: crossRedirectHeaders })
      const sameRedirectResponse = new Response('', { status: 302, headers: sameRedirectHeaders })
      const finalResponse = new Response('ok', { status: 200 })

      let callCount = 0
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        callCount++
        const headers = new Headers(options?.headers)
        if (callCount === 1) {
          expect(headers.get('Authorization')).toBe('Bearer token')
          expect(headers.get('Cookie')).toBe('session=123')
          expect(headers.get('Proxy-Authorization')).toBe('Basic proxy')
          expect(headers.get('X-Custom-Header')).toBe('custom-value')
          return crossRedirectResponse
        }
        if (callCount === 2) {
          // Cross-origin redirect should have stripped sensitive headers but kept custom headers
          expect(headers.get('Authorization')).toBeNull()
          expect(headers.get('Cookie')).toBeNull()
          expect(headers.get('Proxy-Authorization')).toBeNull()
          expect(headers.get('X-Custom-Header')).toBe('custom-value')
          return sameRedirectResponse
        }
        if (callCount === 3) {
          // Same-origin redirect should keep the current headers (which are the stripped ones from call 2)
          expect(headers.get('Authorization')).toBeNull()
          expect(headers.get('Cookie')).toBeNull()
          expect(headers.get('Proxy-Authorization')).toBeNull()
          expect(headers.get('X-Custom-Header')).toBe('custom-value')
          return finalResponse
        }
        return finalResponse
      })

      const res = await safeFetch('https://api.openai.com/v1', {
        headers: {
          Authorization: 'Bearer token',
          Cookie: 'session=123',
          'Proxy-Authorization': 'Basic proxy',
          'X-Custom-Header': 'custom-value',
        },
      })

      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('preserves sensitive headers on same-origin redirect', async () => {
      const redirectHeaders = new Headers({
        location: 'https://api.openai.com/v2',
      })
      const redirectResponse = new Response('', { status: 302, headers: redirectHeaders })
      const finalResponse = new Response('ok', { status: 200 })

      let callCount = 0
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        callCount++
        const headers = new Headers(options?.headers)
        if (callCount === 1) {
          expect(headers.get('Authorization')).toBe('Bearer token')
          return redirectResponse
        }
        if (callCount === 2) {
          expect(headers.get('Authorization')).toBe('Bearer token')
          return finalResponse
        }
        return finalResponse
      })

      const res = await safeFetch('https://api.openai.com/v1', {
        headers: {
          Authorization: 'Bearer token',
        },
      })

      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('mutates method and deletes body for 301, 302, 303 redirects, but preserves them for 307 and 308', async () => {
      const redirect301 = new Response('', {
        status: 301,
        headers: new Headers({ location: 'https://api.openai.com/redirect301' }),
      })
      const redirect302 = new Response('', {
        status: 302,
        headers: new Headers({ location: 'https://api.openai.com/redirect302' }),
      })
      const redirect303 = new Response('', {
        status: 303,
        headers: new Headers({ location: 'https://api.openai.com/redirect303' }),
      })
      const redirect307 = new Response('', {
        status: 307,
        headers: new Headers({ location: 'https://api.openai.com/redirect307' }),
      })
      const redirect308 = new Response('', {
        status: 308,
        headers: new Headers({ location: 'https://api.openai.com/redirect308' }),
      })
      const finalResponse = new Response('ok', { status: 200 })

      let callCount = 0
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        callCount++
        if (callCount === 1) {
          expect(options?.method).toBe('POST')
          expect(options?.body).toBe('testbody')
          return redirect307
        }
        if (callCount === 2) {
          // 307 should preserve POST method and body
          expect(options?.method).toBe('POST')
          expect(options?.body).toBe('testbody')
          return redirect308
        }
        if (callCount === 3) {
          // 308 should preserve POST method and body
          expect(options?.method).toBe('POST')
          expect(options?.body).toBe('testbody')
          return redirect301
        }
        if (callCount === 4) {
          // 301 should mutate method to GET and delete body
          expect(options?.method).toBe('GET')
          expect(options?.body).toBeUndefined()
          return redirect302
        }
        if (callCount === 5) {
          // 302 should mutate method to GET and delete body
          expect(options?.method).toBe('GET')
          expect(options?.body).toBeUndefined()
          return redirect303
        }
        if (callCount === 6) {
          // 303 should mutate method to GET and delete body
          expect(options?.method).toBe('GET')
          expect(options?.body).toBeUndefined()
          return finalResponse
        }
        return finalResponse
      })

      const res = await safeFetch('https://api.openai.com/v1', {
        method: 'POST',
        body: 'testbody',
      })

      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalledTimes(6)
    })
  })
})
