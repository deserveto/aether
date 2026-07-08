import { randomUUID } from 'node:crypto'
import { createLogger } from './logger.js'

type HonoContext = {
  req: {
    method: string
    url: string
    header(name: string): string | undefined
  }
  header(name: string, value: string): void
  set(key: string, value: unknown): void
}

const logger = createLogger('http')

export async function requestIdInjector(
  c: HonoContext,
  next: () => Promise<unknown>,
): Promise<void> {
  const incoming = c.req.header('x-request-id')
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID()
  c.set('requestId', requestId)
  c.header('x-request-id', requestId)
  await next()
}

export async function requestLogger(c: HonoContext, next: () => Promise<unknown>): Promise<void> {
  const start = Date.now()
  await next()
  const durationMs = Date.now() - start
  logger.info({ method: c.req.method, url: c.req.url, durationMs }, 'request')
}
