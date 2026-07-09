import { describe, expect, it } from 'vitest'
import {
  AGENT_ID_PATTERN,
  RESERVED_AGENT_IDS,
  assertValidAgentId,
} from '../agents.js'
import { AppError, ErrorCode } from '../errors.js'

describe('agent id contract', () => {
  it('accepts lowercase kebab-case ids', () => {
    expect(AGENT_ID_PATTERN.test('qa-web-agent')).toBe(true)
    expect(AGENT_ID_PATTERN.test('a')).toBe(true)
    expect(AGENT_ID_PATTERN.test('qa2-web')).toBe(true)
  })

  it('rejects invalid ids', () => {
    expect(AGENT_ID_PATTERN.test('QA-Web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('qa_web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('-qa')).toBe(false)
    expect(AGENT_ID_PATTERN.test('qa--web')).toBe(false)
    expect(AGENT_ID_PATTERN.test('')).toBe(false)
  })

  it('reserves qa agent ids', () => {
    expect(RESERVED_AGENT_IDS.has('qa-web-agent')).toBe(true)
    expect(RESERVED_AGENT_IDS.has('qa-mobile-agent')).toBe(true)
  })

  it('asserts valid ids pass and invalid throw INVALID_INPUT', () => {
    expect(assertValidAgentId('qa-web-agent')).toBe(true)
    expect(() => assertValidAgentId('Bad!')).toThrow(AppError)
    try {
      assertValidAgentId('Bad!')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT)
    }
  })
})
