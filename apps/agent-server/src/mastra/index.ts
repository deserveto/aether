import { Mastra } from '@mastra/core'
import { ConsoleLogger } from '@mastra/core/logger'
import { LibSQLStore } from '@mastra/libsql'
import { initDb, db, toolEvents } from '@aether/database'
import { resolveSecret } from '@aether/providers'
import { listBuiltIn } from '@aether/agents'
import type { MastraDBMessage } from '@mastra/core/agent'
import { env } from '../config/env.js'
import { requestIdInjector, requestLogger } from '../config/middleware.js'
import { healthRoute } from './routes/health.js'
import { providerRoutes } from './routes/providers.js'
import { createProductionAgentRoutes } from './routes/agents.js'
import { createConversationRoutes } from './routes/conversations.js'
import { createChatRoutes } from './routes/chat.js'
import { buildMastraAgents } from '../agents/build.js'
import {
  buildChatDependencies,
  createConversation,
  findConversation,
  listConversations,
} from '../services/conversations.js'
import { randomUUID } from 'node:crypto'

const mastraLogLevel =
  env.LOG_LEVEL === 'trace' ? 'debug' : env.LOG_LEVEL === 'fatal' ? 'error' : env.LOG_LEVEL

await initDb().catch((error: unknown) => {
  console.error('Failed to initialize database:', error)
  process.exit(1)
})

const runtimeDeps = {
  listBuiltIn,
  findBinding: (agentId: string) =>
    db.query.agentModelBindings.findFirst({ where: (f, o) => o.eq(f.agentId, agentId) }),
  findProfile: (profileId: string) =>
    db.query.modelProfiles.findFirst({ where: (f, o) => o.eq(f.id, profileId) }),
  findConnection: (connectionId: string) =>
    db.query.providerConnections.findFirst({ where: (f, o) => o.eq(f.id, connectionId) }),
}

const mastraAgents = await buildMastraAgents({
  ...runtimeDeps,
  databaseUrl: env.DATABASE_URL,
  resolveSecret,
})

const recordToolEvent = async (event: {
  conversationId: string
  toolCallId: string
  toolName: string
  status: 'requested' | 'success' | 'error'
  input?: unknown
  output?: unknown
}) => {
  const now = new Date().toISOString()
  await db
    .insert(toolEvents)
    .values({
      id: randomUUID(),
      conversationId: event.conversationId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      riskLevel: 'interactive',
      status: event.status === 'requested' ? 'requested' : event.status,
      input: JSON.stringify(event.input ?? {}),
      output: event.output !== undefined ? JSON.stringify(event.output) : null,
      startedAt: now,
      endedAt: event.status === 'requested' ? null : now,
    })
    .catch(() => undefined)
}

const persistUserMessage = async (threadId: string, resourceId: string, text: string) => {
  const agent = Object.values(mastraAgents)[0]
  if (!agent) return
  const memory = await agent.getMemory()
  if (!memory) return
  await memory
    .saveMessages({
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          createdAt: new Date(),
          threadId,
          resourceId,
          type: 'text',
          content: {
            format: 2,
            parts: [
              {
                type: 'text',
                text,
              },
            ],
          },
        } as unknown as MastraDBMessage,
      ],
    })
    .catch(() => undefined)
}

export const mastra = new Mastra({
  logger: new ConsoleLogger({ name: 'mastra', level: mastraLogLevel }),
  storage: new LibSQLStore({ id: 'aether-storage', url: env.DATABASE_URL }),
  agents: mastraAgents,
  server: {
    port: env.PORT,
    host: env.HOST,
    apiPrefix: '/_mastra',
    cors: { origin: env.WEB_URL },
    apiRoutes: [
      healthRoute,
      ...providerRoutes,
      ...createProductionAgentRoutes(runtimeDeps),
      ...createConversationRoutes({
        userId: env.AETHER_LOCAL_USER_ID,
        resolveAgent: async (agentId) => {
          const { resolveAgent } = await import('../agents/resolver.js')
          return resolveAgent(runtimeDeps, agentId)
        },
        create: (agentId, title) => createConversation(env.AETHER_LOCAL_USER_ID, agentId, title),
        list: () => listConversations(env.AETHER_LOCAL_USER_ID),
        find: (id) => findConversation(id, env.AETHER_LOCAL_USER_ID),
        loadMessages: async (threadId) => {
          const agent = Object.values(mastraAgents)[0]
          if (!agent) return []
          const memory = await agent.getMemory()
          if (!memory) return []
          const result = await memory.recall({ threadId }).catch(() => ({ messages: [] }))
          return result.messages.map((message) => {
            let textContent = ''
            if (message.content) {
              if (typeof message.content === 'string') {
                textContent = message.content
              } else if (typeof message.content === 'object' && message.content !== null) {
                if ('parts' in message.content && Array.isArray(message.content.parts)) {
                  textContent = message.content.parts
                    .map((p) =>
                      p && typeof p === 'object' && 'text' in p && typeof p.text === 'string'
                        ? p.text
                        : '',
                    )
                    .join('')
                } else if (
                  'content' in message.content &&
                  typeof message.content.content === 'string'
                ) {
                  textContent = message.content.content
                }
              }
            }
            return {
              role: message.role,
              content: textContent,
            }
          })
        },
      }),
      ...createChatRoutes(
        buildChatDependencies({
          userId: env.AETHER_LOCAL_USER_ID,
          agents: mastraAgents,
          recordToolEvent,
          persistUserMessage,
        }),
      ),
    ],
    middleware: [requestIdInjector, requestLogger],
  },
})
