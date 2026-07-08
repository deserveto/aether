import { z } from 'zod'
import type { AppEnv, LogLevel } from '@aether/shared'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().max(65535),
  HOST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  WEB_URL: z.string().url(),
  ALLOW_LOCAL_ENDPOINTS: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .default(false),
})

export type Env = {
  readonly NODE_ENV: AppEnv
  readonly PORT: number
  readonly HOST: string
  readonly DATABASE_URL: string
  readonly LOG_LEVEL: LogLevel
  readonly WEB_URL: string
  readonly ALLOW_LOCAL_ENDPOINTS: boolean
}

export type RawEnv = Record<string, string | undefined>

export function parseEnv(raw: RawEnv, source = 'process.env'): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    // Plain Error (not AppError): env layer must not import the runtime error
    // shape at parse time when even module loading can fail. The bootstrap entry
    // (Task 4) wraps this in a clean shutdown. AppError is reserved for
    // in-request failures where it is meaningful to clients.
    throw new Error(
      `[${source}] Invalid environment:\n${issues}\nFix the values in apps/agent-server/.env`,
    )
  }
  return result.data as Env
}

export const env: Env = parseEnv(process.env)
