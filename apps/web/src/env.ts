import { z } from 'zod'

// Read NEXT_PUBLIC_* via direct `process.env.X` member access only. Next.js
// (Turbopack) inlines specific member accesses into the client bundle; passing
// the whole `process.env` object through zod yields undefined keys in the
// client bundle and crashes browser eval.
const parsed = z.string().url().safeParse(process.env.NEXT_PUBLIC_AGENT_SERVER_URL)
if (!parsed.success) {
  throw new Error(
    '[apps/web] NEXT_PUBLIC_AGENT_SERVER_URL is missing or invalid. Set it in apps/web/.env.local (e.g. http://localhost:4111).',
  )
}

export const NEXT_PUBLIC_AGENT_SERVER_URL: string = parsed.data
