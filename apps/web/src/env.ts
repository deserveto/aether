import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_AGENT_SERVER_URL: z.string().url(),
})

export type WebEnv = z.infer<typeof schema>

function load(): WebEnv {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`[apps/web] Invalid environment:\n${issues}`)
  }
  return result.data
}

export const env = load()
