import { z } from 'zod'
import type { AppEnv, LogLevel } from '@aether/shared'

// NOTE: do NOT use `.default()` / `.optional()` / `z.union` on these fields.
// Mastra's dev server runs zod v4 `toJSONSchema` over schemas in the
// agent-server module graph to build its OpenAPI manifest, and zod v4 cannot
// represent `optional` (which `.default()` produces) — `mastra dev` crashes with
// "[toJSONSchema]: Non-representable type encountered: optional". Keep every
// field a plain JSON-schema-representable type; apply defaults in `parseEnv`.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().max(65535),
  HOST: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  WEB_URL: z.string().url(),
  ALLOW_LOCAL_ENDPOINTS: z.enum(['true', 'false']),
  ENCRYPTION_KEY: z.string().min(32),
  AETHER_DEFAULT_AGENT_ID: z.string().min(1),
  AETHER_LOCAL_USER_ID: z.string().min(1),
  SEARXNG_URL: z.string().url(),
})

export type Env = {
  readonly NODE_ENV: AppEnv
  readonly PORT: number
  readonly HOST: string
  readonly DATABASE_URL: string
  readonly LOG_LEVEL: LogLevel
  readonly WEB_URL: string
  readonly ALLOW_LOCAL_ENDPOINTS: boolean
  readonly ENCRYPTION_KEY: string
  readonly AETHER_DEFAULT_AGENT_ID: string
  readonly AETHER_LOCAL_USER_ID: string
  readonly SEARXNG_URL: string
}

export type RawEnv = Record<string, string | undefined>

export function parseEnv(raw: RawEnv, source = 'process.env'): Env {
  const input: RawEnv = { ...raw }
  if (input.ALLOW_LOCAL_ENDPOINTS === undefined || input.ALLOW_LOCAL_ENDPOINTS === '') {
    input.ALLOW_LOCAL_ENDPOINTS = 'false'
  }
  if (!input.SEARXNG_URL || input.SEARXNG_URL === '') {
    input.SEARXNG_URL = 'http://localhost:8080'
  }
  const result = envSchema.safeParse(input)
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
  const data = result.data
  return { ...data, ALLOW_LOCAL_ENDPOINTS: data.ALLOW_LOCAL_ENDPOINTS === 'true' }
}

export const env: Env = parseEnv(process.env)
