import { describe, expect, it } from 'vitest'
import { envSchema } from '../config/env.js'

const validBase = {
  NODE_ENV: 'development',
  PORT: '4111',
  HOST: 'localhost',
  DATABASE_URL: 'file:./mastra.db',
  LOG_LEVEL: 'info',
  WEB_URL: 'http://localhost:3000',
  ALLOW_LOCAL_ENDPOINTS: 'false',
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
