import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { db, storedAgents } from '@aether/database'
import { eq, and } from 'drizzle-orm'
import { AppError, ErrorCode, assertValidAgentId, RESERVED_AGENT_IDS } from '@aether/shared'
import { z } from 'zod'

const agentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  instructions: z.string(),
  category: z.enum(['qa', 'research', 'productivity', 'social', 'custom']),
  capabilities: z.array(z.string()),
  toolIds: z.array(z.string()),
  primaryModelProfileId: z.string().nullable(),
  fallbackModelProfileIds: z.array(z.string()),
  memoryEnabled: z.boolean(),
  memoryMode: z.enum(['thread', 'resource-and-thread']),
  visibility: z.enum(['private', 'internal', 'public']),
})

export function createBuilderRoutes(): ApiRoute[] {
  return [
    registerApiRoute('/api/builder/agents', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const rows = await db.query.storedAgents.findMany()
          return c.json(rows)
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),

    registerApiRoute('/api/builder/agents', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const body = agentSchema.parse(await c.req.json())
          assertValidAgentId(body.id)

          if (RESERVED_AGENT_IDS.has(body.id)) {
            return c.json(
              {
                error: {
                  code: ErrorCode.INVALID_INPUT,
                  message: 'Cannot reuse reserved Agent IDs',
                },
              },
              400,
            )
          }

          // Check if agent already exists
          const existing = await db.query.storedAgents.findFirst({
            where: (f, o) => o.eq(f.id, body.id),
          })
          if (existing) {
            return c.json(
              { error: { code: ErrorCode.INVALID_INPUT, message: 'Agent ID already exists' } },
              409,
            )
          }

          const now = new Date().toISOString()
          const [row] = await db
            .insert(storedAgents)
            .values({
              id: body.id,
              status: 'draft',
              name: body.name,
              description: body.description,
              instructions: body.instructions,
              category: body.category,
              capabilities: body.capabilities,
              toolIds: body.toolIds,
              primaryModelProfileId: body.primaryModelProfileId,
              fallbackModelProfileIds: body.fallbackModelProfileIds,
              memoryEnabled: body.memoryEnabled,
              memoryMode: body.memoryMode,
              visibility: body.visibility,
              createdAt: now,
              updatedAt: now,
            })
            .returning()

          return c.json(row)
        } catch (error) {
          if (error instanceof z.ZodError) {
            return c.json(
              { error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid input data' } },
              400,
            )
          }
          if (error instanceof AppError) {
            return c.json({ error: { code: error.code, message: error.message } }, 400)
          }
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),

    registerApiRoute('/api/builder/agents/:id', {
      method: 'PUT',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const id = c.req.param('id')
          const body = agentSchema.parse(await c.req.json())

          const draft = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'draft')),
          })

          const now = new Date().toISOString()
          if (!draft) {
            // Edit first time: copy published version to draft row
            const published = await db.query.storedAgents.findFirst({
              where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'published')),
            })
            if (!published) {
              return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
            }
            await db.insert(storedAgents).values({
              id: published.id,
              status: 'draft',
              name: published.name,
              description: published.description,
              instructions: published.instructions,
              category: published.category,
              capabilities: published.capabilities,
              toolIds: published.toolIds,
              primaryModelProfileId: published.primaryModelProfileId,
              fallbackModelProfileIds: published.fallbackModelProfileIds,
              memoryEnabled: published.memoryEnabled,
              memoryMode: published.memoryMode,
              visibility: published.visibility,
              createdAt: published.createdAt,
              updatedAt: now,
            })
          }

          const [updated] = await db
            .update(storedAgents)
            .set({
              name: body.name,
              description: body.description,
              instructions: body.instructions,
              category: body.category,
              capabilities: body.capabilities,
              toolIds: body.toolIds,
              primaryModelProfileId: body.primaryModelProfileId,
              fallbackModelProfileIds: body.fallbackModelProfileIds,
              memoryEnabled: body.memoryEnabled,
              memoryMode: body.memoryMode,
              visibility: body.visibility,
              updatedAt: now,
            })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'draft')))
            .returning()

          return c.json(updated)
        } catch (error) {
          if (error instanceof z.ZodError) {
            return c.json(
              { error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid input data' } },
              400,
            )
          }
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),

    registerApiRoute('/api/builder/agents/:id/publish', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const id = c.req.param('id')
          const draft = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'draft')),
          })
          if (!draft) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Draft not found' } }, 404)
          }

          if (!draft.primaryModelProfileId) {
            return c.json(
              {
                error: {
                  code: ErrorCode.INVALID_INPUT,
                  message: 'Agent requires model profile to publish',
                },
              },
              400,
            )
          }

          const now = new Date().toISOString()

          // Delete existing published and archived
          await db
            .delete(storedAgents)
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'published')))
          await db
            .delete(storedAgents)
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'archived')))

          const [published] = await db
            .update(storedAgents)
            .set({ status: 'published', updatedAt: now })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'draft')))
            .returning()

          return c.json(published)
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),

    registerApiRoute('/api/builder/agents/:id/archive', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const id = c.req.param('id')
          const published = await db.query.storedAgents.findFirst({
            where: (f, o) => o.and(o.eq(f.id, id), o.eq(f.status, 'published')),
          })
          if (!published) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Published agent not found' } }, 404)
          }

          const now = new Date().toISOString()
          const [archived] = await db
            .update(storedAgents)
            .set({ status: 'archived', updatedAt: now })
            .where(and(eq(storedAgents.id, id), eq(storedAgents.status, 'published')))
            .returning()

          return c.json(archived)
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),

    registerApiRoute('/api/builder/agents/:id', {
      method: 'DELETE',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const id = c.req.param('id')
          if (RESERVED_AGENT_IDS.has(id)) {
            return c.json(
              {
                error: {
                  code: ErrorCode.INVALID_INPUT,
                  message: 'Cannot delete built-in agents',
                },
              },
              400,
            )
          }

          await db.delete(storedAgents).where(eq(storedAgents.id, id))
          return c.json({ success: true })
        } catch {
          return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
        }
      },
    }),
  ]
}
