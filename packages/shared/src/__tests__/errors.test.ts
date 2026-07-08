import { describe, expect, it } from 'vitest'
import { AppError, ErrorCode } from '../errors.js'

describe('AppError', () => {
  it('carries code, message, retryable, and details', () => {
    const err = new AppError({
      code: ErrorCode.NOT_CONFIGURED,
      message: 'DATABASE_URL is missing',
      retryable: false,
      details: { field: 'DATABASE_URL' },
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AppError')
    expect(err.code).toBe('NOT_CONFIGURED')
    expect(err.message).toBe('DATABASE_URL is missing')
    expect(err.retryable).toBe(false)
    expect(err.details).toEqual({ field: 'DATABASE_URL' })
  })

  it('defaults retryable to false', () => {
    const err = new AppError({ code: ErrorCode.INTERNAL, message: 'boom' })
    expect(err.retryable).toBe(false)
    expect(err.details).toBeUndefined()
  })

  it('preserves a cause', () => {
    const cause = new Error('root')
    const err = new AppError({ code: ErrorCode.NETWORK_ERROR, message: 'upstream', cause })
    expect(err.cause).toBe(cause)
  })
})

describe('ErrorCode', () => {
  it('contains the stable codes from TOOL_CONTRACT', () => {
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(ErrorCode.NOT_CONFIGURED).toBe('NOT_CONFIGURED')
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT')
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED')
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    expect(ErrorCode.UNSUPPORTED_CONTENT).toBe('UNSUPPORTED_CONTENT')
    expect(ErrorCode.DEVICE_NOT_FOUND).toBe('DEVICE_NOT_FOUND')
    expect(ErrorCode.COMMAND_FAILED).toBe('COMMAND_FAILED')
    expect(ErrorCode.INTERNAL).toBe('INTERNAL')
  })
})
