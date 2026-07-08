import { initDb } from '@aether/database'

await initDb().catch((error: unknown) => {
  console.error('Failed to initialize database:', error)
  process.exit(1)
})

export { mastra } from './mastra/index.js'
