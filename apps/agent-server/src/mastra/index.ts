import { Mastra } from '@mastra/core'
import { ConsoleLogger } from '@mastra/core/logger'
import { LibSQLStore } from '@mastra/libsql'
import { env } from '../config/env.js'
import { requestIdInjector, requestLogger } from '../config/middleware.js'
import { healthRoute } from './routes/health.js'

// Mastra's IMastraLogger accepts a narrower LogLevel ('debug'|'info'|'warn'|'error'|'silent')
// than @aether/shared's LogLevel ('trace'|...|'fatal'). Map the two extra severities onto
// Mastra's nearest level. Pino (used by the HTTP middleware) keeps full fidelity.
const mastraLogLevel =
  env.LOG_LEVEL === 'trace' ? 'debug' : env.LOG_LEVEL === 'fatal' ? 'error' : env.LOG_LEVEL

export const mastra = new Mastra({
  logger: new ConsoleLogger({ name: 'mastra', level: mastraLogLevel }),
  storage: new LibSQLStore({
    id: 'aether-storage',
    url: env.DATABASE_URL,
  }),
  server: {
    port: env.PORT,
    host: env.HOST,
    // Native Mastra CORS: explicit single-origin allowlist. The default when unset is '*'
    // (see Mastra's getCorsConfig), which the Aether spec forbids. We pass the WEB_URL origin
    // so only the web app's origin is allowed in every environment.
    cors: {
      origin: env.WEB_URL,
    },
    apiRoutes: [healthRoute],
    middleware: [requestIdInjector, requestLogger],
  },
})
