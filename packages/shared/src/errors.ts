export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNSUPPORTED_CONTENT: 'UNSUPPORTED_CONTENT',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  COMMAND_FAILED: 'COMMAND_FAILED',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface AppErrorDetails {
  readonly [key: string]: unknown
}

export interface AppErrorInput {
  readonly code: ErrorCode
  readonly message: string
  readonly retryable?: boolean
  readonly details?: AppErrorDetails
  readonly cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly details?: AppErrorDetails

  constructor(input: AppErrorInput) {
    super(input.message, { cause: input.cause })
    this.name = 'AppError'
    this.code = input.code
    this.retryable = input.retryable ?? false
    if (input.details !== undefined) {
      this.details = input.details
    }
  }
}
