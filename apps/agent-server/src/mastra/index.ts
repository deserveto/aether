import { Mastra } from '@mastra/core'
import { ConsoleLogger } from '@mastra/core/logger'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { initDb, db, toolEvents } from '@aether/database'
import { resolveSecret } from '@aether/providers'
import { listBuiltIn } from '@aether/agents'
import { AppError, ErrorCode } from '@aether/shared'
import { BrowserSessionStore } from '@aether/tools'
import type { MastraDBMessage } from '@mastra/core/agent'
import { env } from '../config/env.js'
import { requestIdInjector, requestLogger } from '../config/middleware.js'
import { healthRoute } from './routes/health.js'
import { providerRoutes } from './routes/providers.js'
import { createProductionAgentRoutes } from './routes/agents.js'
import { createConversationRoutes } from './routes/conversations.js'
import { createChatRoutes } from './routes/chat.js'
import { buildMastraAgents, buildDynamicAgent } from '../agents/build.js'
import { resolveAgent } from '../agents/resolver.js'
import { createBuilderRoutes } from './routes/builder.js'
import { getCurrentConversationId } from '../agents/conversation-context.js'
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
  listStoredAgents: async (status?: 'draft' | 'published' | 'archived') => {
    const rows = await db.query.storedAgents.findMany(
      status ? { where: (f, o) => o.eq(f.status, status) } : undefined,
    )
    return rows.map((r) => ({
      ...r,
      capabilities: r.capabilities,
      toolIds: r.toolIds,
      fallbackModelProfileIds: r.fallbackModelProfileIds,
      memoryEnabled: Boolean(r.memoryEnabled),
    }))
  },
  findStoredAgent: async (id: string, status: 'draft' | 'published' | 'archived') => {
    const row = await db.query.storedAgents.findFirst({
      where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, status)),
    })
    if (!row) return undefined
    return {
      ...row,
      capabilities: row.capabilities,
      toolIds: row.toolIds,
      fallbackModelProfileIds: row.fallbackModelProfileIds,
      memoryEnabled: Boolean(row.memoryEnabled),
    }
  },
}

const agentMemory = new Memory({
  storage: new LibSQLStore({ id: 'aether-memory', url: env.DATABASE_URL }),
})
const browserSessionStore = new BrowserSessionStore()
const mastraAgentDeps = {
  ...runtimeDeps,
  databaseUrl: env.DATABASE_URL,
  searxngUrl: env.SEARXNG_URL,
  resolveSecret,
  memory: agentMemory,
  sessionStore: browserSessionStore,
}

const mastraAgents = await buildMastraAgents(mastraAgentDeps)

async function getConfiguredMastraAgent(agentId: string, conversationId?: string) {
  let version: 'published' | 'draft' = 'published'
  if (conversationId) {
    const conv = await db.query.conversations.findFirst({
      where: (f, o) => o.eq(f.id, conversationId),
    })
    if (conv) {
      version = conv.agentVersion
    }
  } else {
    try {
      const currentConvId = getCurrentConversationId()
      const conv = await db.query.conversations.findFirst({
        where: (f, o) => o.eq(f.id, currentConvId),
      })
      if (conv) {
        version = conv.agentVersion
      }
    } catch {
      // Not in conversation context
    }
  }

  const resolved = await resolveAgent(runtimeDeps, agentId, version)
  if (!resolved?.configured) {
    throw new AppError({
      code: ErrorCode.NOT_CONFIGURED,
      message: 'Agent is not configured with an approved model',
    })
  }

  return buildDynamicAgent(mastraAgentDeps, agentId, version)
}

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
  await agentMemory
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
      ...createBuilderRoutes(),
      ...createConversationRoutes({
        userId: env.AETHER_LOCAL_USER_ID,
        resolveAgent: (agentId, version) => resolveAgent(runtimeDeps, agentId, version),
        create: (agentId, title, version) => createConversation(env.AETHER_LOCAL_USER_ID, agentId, title, version),
        list: () => listConversations(env.AETHER_LOCAL_USER_ID),
        find: (id) => findConversation(id, env.AETHER_LOCAL_USER_ID),
        loadMessages: async (threadId) => {
          const result = await agentMemory.recall({ threadId }).catch(() => ({ messages: [] }))
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
          getAgent: getConfiguredMastraAgent,
          recordToolEvent,
          persistUserMessage,
        }),
      ),
    ],
    middleware: [requestIdInjector, requestLogger],
  },
})
