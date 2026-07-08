import pino, { type Logger } from 'pino'
import { env } from './env.js'

export function createLogger(name = 'agent-server'): Logger {
  return pino({
    name,
    level: env.LOG_LEVEL,
    redact: {
      paths: ['*.key', '*.secret', '*.token', '*.apiKey', 'authorization', '*.password'],
      censor: '[REDACTED]',
    },
    base: { service: 'agent-server', env: env.NODE_ENV },
  })
}

export type { Logger }
