import { env } from './env.js'

type HonoContext = {
  req: {
    method: string
    header(name: string): string | undefined
    url: string
  }
  header(name: string, value: string): void
}

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const ALLOWED_HEADERS = 'Content-Type, Authorization'

export function corsMiddleware() {
  const allowed = new URL(env.WEB_URL).origin

  return async (c: HonoContext, next: () => Promise<unknown>): Promise<Response | void> => {
    const origin = c.req.header('Origin')
    if (origin === allowed) {
      c.header('Access-Control-Allow-Origin', allowed)
      c.header('Access-Control-Allow-Methods', ALLOWED_METHODS)
      c.header('Access-Control-Allow-Headers', ALLOWED_HEADERS)
      c.header('Vary', 'Origin')
    }
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }
    await next()
    return undefined
  }
}
