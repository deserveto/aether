import { AppError, ErrorCode } from '@aether/shared'

/**
 * Converts an IPv4 address string to a 32-bit unsigned integer.
 * Returns NaN if the string is not a valid IPv4 address.
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) return NaN
  let result = 0
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255 || part === '') return NaN
    result = (result * 256 + n) >>> 0
  }
  return result
}

/**
 * Returns true if the given IP string is a private, loopback, or link-local address.
 * Handles IPv4 and a subset of IPv6 (::1, fc00::/7, fe80::/10).
 */
export function isPrivateIp(ip: string): boolean {
  // IPv6 checks
  if (ip.includes(':')) {
    if (ip === '::1') return true
    // Expand leading '::' to get first group
    const firstGroup = ip.split(':')[0]
    if (firstGroup === '' || firstGroup === undefined) return false
    const val = parseInt(firstGroup, 16)
    if (isNaN(val)) return false
    // fc00::/7 — unique local
    if ((val & 0xfe00) === 0xfc00) return true
    // fe80::/10 — link-local
    if ((val & 0xffc0) === 0xfe80) return true
    return false
  }

  // IPv4 checks via bitmask arithmetic
  const n = ipv4ToInt(ip)
  if (isNaN(n)) return false

  // 127.0.0.0/8 — loopback
  if ((n & 0xff000000) >>> 0 === (127 * 0x1000000) >>> 0) return true
  // 10.0.0.0/8 — private
  if ((n & 0xff000000) >>> 0 === (10 * 0x1000000) >>> 0) return true
  // 172.16.0.0/12 — private
  if ((n & 0xfff00000) >>> 0 === (172 * 0x1000000 + 16 * 0x10000) >>> 0) return true
  // 192.168.0.0/16 — private
  if ((n & 0xffff0000) >>> 0 === (192 * 0x1000000 + 168 * 0x10000) >>> 0) return true
  // 169.254.0.0/16 — link-local
  if ((n & 0xffff0000) >>> 0 === (169 * 0x1000000 + 254 * 0x10000) >>> 0) return true

  return false
}

/**
 * Validates a raw URL string against SSRF attack vectors.
 * Throws AppError for:
 *  - non-http/https schemes (INVALID_INPUT)
 *  - credentials embedded in URL (INVALID_INPUT)
 *  - private/loopback IP in hostname (PERMISSION_DENIED)
 *
 * @returns parsed URL object on success
 */
export function validateUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new AppError({ code: ErrorCode.INVALID_INPUT, message: `Invalid URL: ${rawUrl}` })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: `URL scheme must be http or https, got: ${parsed.protocol}`,
    })
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new AppError({
      code: ErrorCode.INVALID_INPUT,
      message: 'URL must not contain credentials',
    })
  }

  if (isPrivateIp(parsed.hostname)) {
    throw new AppError({
      code: ErrorCode.PERMISSION_DENIED,
      message: `Access to private/loopback IP is not allowed: ${parsed.hostname}`,
    })
  }

  return parsed
}
