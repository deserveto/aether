import dns from 'dns/promises'
import ipaddr from 'ipaddr.js'
import { AppError, ErrorCode } from '@aether/shared'

/**
 * Validates a URL to prevent SSRF attacks.
 * Rejects credentials, non-HTTPS protocols in production, and private/loopback IP resolutions.
 */
export async function validateUrl(urlStr: string): Promise<string> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid URL format',
    })
  }

  if (url.username || url.password) {
    throw new AppError({
      code: ErrorCode.PERMISSION_DENIED,
      message: 'Credentials in URLs are rejected',
    })
  }

  const allowLocal = process.env.ALLOW_LOCAL_ENDPOINTS === 'true'
  if (allowLocal) {
    return url.toString()
  }

  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && url.protocol !== 'https:') {
    throw new AppError({
      code: ErrorCode.PERMISSION_DENIED,
      message: 'HTTPS protocol is required in production',
    })
  }

  // Resolve hostname to check IPs
  let ips: string[]
  try {
    const lookup = await dns.lookup(url.hostname, { all: true })
    ips = lookup.map((l) => l.address)
  } catch {
    throw new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: `Failed to resolve hostname: ${url.hostname}`,
    })
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new AppError({
        code: ErrorCode.PERMISSION_DENIED,
        message: `Endpoint resolved to blocked IP: ${ip}`,
      })
    }
  }

  return url.toString()
}

function isPrivateIp(ipStr: string): boolean {
  try {
    let addr = ipaddr.parse(ipStr)
    if (addr.kind() === 'ipv6') {
      const ipv6Addr = addr as ipaddr.IPv6
      if (ipv6Addr.isIPv4MappedAddress()) {
        addr = ipv6Addr.toIPv4Address()
      }
    }
    const range = addr.range()

    // Blocked ranges:
    const blockedRanges = [
      'uniqueLocal',
      'linkLocal',
      'loopback',
      'private',
      'unspecified',
      'broadcast',
      'multicast',
      'rfc6145',
    ]

    if (blockedRanges.includes(range)) {
      return true
    }

    // Check for AWS/GCP/Azure metadata address
    if (addr.toString() === '169.254.169.254') {
      return true
    }

    return false
  } catch {
    // If ip cannot be parsed, treat as invalid / untrusted
    return true
  }
}

/**
 * Fetches a URL securely by preventing SSRF and enforcing response size limits.
 */
export async function safeFetch(urlStr: string, options: RequestInit = {}): Promise<Response> {
  let originalOrigin: string
  try {
    originalOrigin = new URL(urlStr).origin
  } catch {
    originalOrigin = ''
  }

  const activeOptions = { ...options }
  let currentUrl = urlStr
  let redirectCount = 0
  const maxRedirects = 5

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000) // 5-second timeout

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  try {
    while (true) {
      const validatedUrl = await validateUrl(currentUrl)

      const response = await fetch(validatedUrl, {
        ...activeOptions,
        redirect: 'manual',
        signal,
      })

      // Check for redirect status codes (301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) {
          return response // No location header, just return
        }

        if (redirectCount >= maxRedirects) {
          throw new AppError({
            code: ErrorCode.NETWORK_ERROR,
            message: 'Too many redirects',
          })
        }

        redirectCount++

        // Resolve relative redirect location against the current validated URL
        const redirectedUrl = new URL(location, validatedUrl)

        if (originalOrigin && redirectedUrl.origin !== originalOrigin) {
          if (activeOptions.headers) {
            const headers = new Headers(activeOptions.headers)
            headers.delete('authorization')
            headers.delete('cookie')
            headers.delete('proxy-authorization')
            activeOptions.headers = headers
          }
        }

        if (response.status === 301 || response.status === 302 || response.status === 303) {
          activeOptions.method = 'GET'
          delete activeOptions.body
        }

        currentUrl = redirectedUrl.toString()
        continue
      }

      // Limit response size (5MB check)
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        throw new AppError({
          code: ErrorCode.UNSUPPORTED_CONTENT,
          message: 'Response body exceeds size limit of 5MB',
        })
      }

      return response
    }
  } finally {
    clearTimeout(timeout)
  }
}
