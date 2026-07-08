/* global process */
// Vitest global setup: seed process.env with the agent-server example values so
// that importing `apps/agent-server/src/config/env.ts` (which parses
// process.env at module load) succeeds during tests without a real .env file.
// Values mirror apps/agent-server/.env.example. `??=` preserves any value a
// developer has already exported in their shell.
process.env.NODE_ENV ??= 'development'
process.env.PORT ??= '4111'
process.env.HOST ??= 'localhost'
process.env.DATABASE_URL ??= 'file:./mastra.db'
process.env.LOG_LEVEL ??= 'info'
process.env.WEB_URL ??= 'http://localhost:3000'
process.env.ALLOW_LOCAL_ENDPOINTS ??= 'false'
