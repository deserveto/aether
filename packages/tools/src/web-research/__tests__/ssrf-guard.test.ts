import { describe, it, expect } from 'vitest'
import { isPrivateIp, validateUrl } from '../ssrf-guard.js'
import { AppError } from '@aether/shared'

describe('isPrivateIp', () => {
  it('returns true for 127.0.0.1', () => expect(isPrivateIp('127.0.0.1')).toBe(true))
  it('returns true for 10.0.0.1', () => expect(isPrivateIp('10.0.0.1')).toBe(true))
  it('returns true for 172.16.0.1', () => expect(isPrivateIp('172.16.0.1')).toBe(true))
  it('returns true for 192.168.1.1', () => expect(isPrivateIp('192.168.1.1')).toBe(true))
  it('returns true for 169.254.0.1 (link-local)', () => expect(isPrivateIp('169.254.0.1')).toBe(true))
  it('returns true for ::1', () => expect(isPrivateIp('::1')).toBe(true))
  it('returns false for 8.8.8.8', () => expect(isPrivateIp('8.8.8.8')).toBe(false))
  it('returns false for 1.1.1.1', () => expect(isPrivateIp('1.1.1.1')).toBe(false))
})

describe('validateUrl', () => {
  it('accepts valid https URL', () => {
    const result = validateUrl('https://example.com/page')
    expect(result).toBeInstanceOf(URL)
    expect(result.hostname).toBe('example.com')
  })
  it('accepts valid http URL', () => {
    expect(() => validateUrl('http://example.com')).not.toThrow()
  })
  it('rejects non-http scheme', () => {
    expect(() => validateUrl('file:///etc/passwd')).toThrow(AppError)
    expect(() => validateUrl('ftp://example.com')).toThrow(AppError)
  })
  it('rejects URL with credentials', () => {
    expect(() => validateUrl('https://user:pass@example.com')).toThrow(AppError)
  })
  it('rejects private IP', () => {
    expect(() => validateUrl('http://192.168.1.1')).toThrow(AppError)
  })
  it('rejects loopback IP', () => {
    expect(() => validateUrl('http://127.0.0.1')).toThrow(AppError)
  })
})
