import { describe, expect, it } from 'vitest'
import { envSchema, parseEnv } from '../config/env.js'

const validBase = {
  NODE_ENV: 'development',
  PORT: '4111',
  HOST: 'localhost',
  DATABASE_URL: 'file:./mastra.db',
  LOG_LEVEL: 'info',
  WEB_URL: 'http://localhost:3000',
  ALLOW_LOCAL_ENDPOINTS: 'false',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
} as const

describe('envSchema', () => {
  it('accepts a complete valid environment', () => {
    const parsed = envSchema.parse(validBase)
    expect(parsed.NODE_ENV).toBe('development')
    expect(parsed.PORT).toBe(4111)
    expect(parsed.DATABASE_URL).toBe('file:./mastra.db')
  })

  it('rejects an invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validBase, NODE_ENV: 'staging' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty DATABASE_URL', () => {
    const result = envSchema.safeParse({ ...validBase, DATABASE_URL: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid LOG_LEVEL', () => {
    const result = envSchema.safeParse({ ...validBase, LOG_LEVEL: 'verbose' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid WEB_URL', () => {
    const result = envSchema.safeParse({ ...validBase, WEB_URL: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('rejects an encryption key shorter than 32 characters', () => {
    const result = envSchema.safeParse({ ...validBase, ENCRYPTION_KEY: 'too-short' })
    expect(result.success).toBe(false)
  })

  it('exposes the validated encryption key through parseEnv', () => {
    expect(parseEnv(validBase).ENCRYPTION_KEY).toBe(validBase.ENCRYPTION_KEY)
  })

  it('aggregates multiple errors', () => {
    const result = envSchema.safeParse({
      ...validBase,
      NODE_ENV: 'staging',
      LOG_LEVEL: 'verbose',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('NODE_ENV')
      expect(paths).toContain('LOG_LEVEL')
    }
  })
})

describe('parseEnv ALLOW_LOCAL_ENDPOINTS', () => {
  it("parses the string 'false' as boolean false", () => {
    const parsed = parseEnv({ ...validBase, ALLOW_LOCAL_ENDPOINTS: 'false' })
    expect(parsed.ALLOW_LOCAL_ENDPOINTS).toBe(false)
  })

  it("parses the string 'true' as boolean true", () => {
    const parsed = parseEnv({ ...validBase, ALLOW_LOCAL_ENDPOINTS: 'true' })
    expect(parsed.ALLOW_LOCAL_ENDPOINTS).toBe(true)
  })

  it('defaults to false when absent', () => {
    const parsed = parseEnv({ ...validBase, ALLOW_LOCAL_ENDPOINTS: undefined })
    expect(parsed.ALLOW_LOCAL_ENDPOINTS).toBe(false)
  })

  it('rejects an invalid value', () => {
    expect(() => parseEnv({ ...validBase, ALLOW_LOCAL_ENDPOINTS: 'yes' })).toThrow()
  })
})
