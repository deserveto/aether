import { randomUUID } from 'node:crypto'
import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import {
  aetherSecrets,
  agentModelBindings,
  db,
  modelProfiles,
  providerConnections,
} from '@aether/database'
import {
  encryptSecret,
  getAdapter,
  resolveSecret,
  validateUrl,
  type ConnectionValidationResult,
  type DiscoveredModel,
  type ProviderType,
} from '@aether/providers'
import { AppError, ErrorCode } from '@aether/shared'
import { eq } from 'drizzle-orm'
import { z, ZodError } from 'zod'

type Connection = typeof providerConnections.$inferSelect
type ConnectionCreate = typeof providerConnections.$inferInsert
type ConnectionUpdate = Partial<Omit<ConnectionCreate, 'id'>>
type Profile = typeof modelProfiles.$inferSelect
type ProfileCreate = typeof modelProfiles.$inferInsert
type ProfileUpdate = Partial<Omit<ProfileCreate, 'id' | 'providerConnectionId' | 'modelId'>>
type Binding = typeof agentModelBindings.$inferSelect
type BindingCreate = typeof agentModelBindings.$inferInsert

interface AdapterPort {
  validateConnection(
    baseUrl: string | undefined,
    apiKey: string,
  ): Promise<ConnectionValidationResult>
  listModels(baseUrl: string | undefined, apiKey: string): Promise<DiscoveredModel[]>
}

export interface ProviderRouteDependencies {
  connections: {
    list(): Promise<Connection[]>
    find(id: string): Promise<Connection | undefined>
    create(value: ConnectionCreate): Promise<Connection>
    update(id: string, value: ConnectionUpdate): Promise<Connection | undefined>
    remove(id: string): Promise<boolean>
  }
  profiles: {
    list(): Promise<Profile[]>
    find(id: string): Promise<Profile | undefined>
    create(value: ProfileCreate): Promise<Profile>
    update(id: string, value: ProfileUpdate): Promise<Profile | undefined>
  }
  bindings: {
    list(): Promise<Binding[]>
    upsert(value: BindingCreate): Promise<Binding>
  }
  encryptSecret(value: string): Promise<string>
  deleteSecret(secretRef: string): Promise<void>
  resolveSecret(secretRef: string): Promise<string>
  getAdapter(type: ProviderType): AdapterPort
  validateBaseUrl?(url: string): Promise<void>
}

const providerTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'openai-compatible',
])
const connectionCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    type: providerTypeSchema,
    baseUrl: z.string().url().nullable().optional(),
    apiKey: z.string().min(1),
    enabled: z.boolean().optional(),
  })
  .refine((value) => value.type !== 'openai-compatible' || Boolean(value.baseUrl), {
    message: 'baseUrl is required for openai-compatible providers',
    path: ['baseUrl'],
  })
const connectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: providerTypeSchema.optional(),
    baseUrl: z.string().url().nullable().optional(),
    apiKey: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })
const connectionIdSchema = z.object({ connectionId: z.string().min(1) })
const capabilitiesSchema = z.object({
  streaming: z.boolean(),
  toolCalling: z.boolean(),
  structuredOutput: z.boolean(),
  vision: z.boolean(),
  fileInput: z.boolean(),
  reasoning: z.boolean(),
})
const settingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  })
  .optional()
const profileCreateSchema = z.object({
  providerConnectionId: z.string().min(1),
  modelId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  capabilities: capabilitiesSchema,
  approved: z.boolean().optional(),
  enabled: z.boolean().optional(),
  defaultSettings: settingsSchema,
})
const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    capabilities: capabilitiesSchema.optional(),
    approved: z.boolean().optional(),
    enabled: z.boolean().optional(),
    defaultSettings: settingsSchema.nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' })
const bindingSchema = z.object({
  agentId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  primaryModelProfileId: z.string().min(1),
  fallbackModelProfileIds: z.array(z.string().min(1)).default([]),
})

function publicConnection(connection: Connection) {
  const { secretRef, ...publicFields } = connection
  void secretRef
  return publicFields
}

function normalizeSettings(
  settings:
    { temperature?: number | undefined; maxOutputTokens?: number | undefined } | null | undefined,
) {
  if (settings === null || settings === undefined) return settings
  return {
    ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
    ...(settings.maxOutputTokens !== undefined
      ? { maxOutputTokens: settings.maxOutputTokens }
      : {}),
  }
}

function errorResponse(c: { json(body: unknown, status?: number): Response }, error: unknown) {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: { code: ErrorCode.INVALID_INPUT, message: 'Invalid request', issues: error.issues },
      },
      400,
    )
  }
  if (error instanceof AppError) {
    const status = error.code === ErrorCode.INVALID_INPUT ? 400 : 502
    return c.json({ error: { code: error.code, message: error.message } }, status)
  }
  return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Internal server error' } }, 500)
}

function notFound(c: { json(body: unknown, status?: number): Response }, resource: string) {
  return c.json({ error: { code: 'NOT_FOUND', message: `${resource} not found` } }, 404)
}

async function validateBaseUrl(
  deps: ProviderRouteDependencies,
  baseUrl: string | null | undefined,
) {
  if (baseUrl) await deps.validateBaseUrl?.(baseUrl)
}

export function createProviderRoutes(deps: ProviderRouteDependencies): ApiRoute[] {
  return [
    registerApiRoute('/api/providers/connections', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json((await deps.connections.list()).map(publicConnection))
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/connections', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        let secretRef: string | undefined
        try {
          const input = connectionCreateSchema.parse(await c.req.json())
          await validateBaseUrl(deps, input.baseUrl)
          secretRef = await deps.encryptSecret(input.apiKey)
          const created = await deps.connections.create({
            id: randomUUID(),
            name: input.name,
            type: input.type,
            baseUrl: input.baseUrl ?? null,
            secretRef,
            enabled: input.enabled ?? true,
            status: 'untested',
          })
          return c.json(publicConnection(created), 201)
        } catch (error) {
          if (secretRef) await deps.deleteSecret(secretRef).catch(() => undefined)
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/connections/:id', {
      method: 'PUT',
      requiresAuth: false,
      handler: async (c) => {
        let replacementRef: string | undefined
        let replacementCommitted = false
        try {
          const existing = await deps.connections.find(c.req.param('id'))
          if (!existing) return notFound(c, 'Connection')
          const input = connectionUpdateSchema.parse(await c.req.json())
          await validateBaseUrl(deps, input.baseUrl)
          if (
            (input.type ?? existing.type) === 'openai-compatible' &&
            !(input.baseUrl ?? existing.baseUrl)
          ) {
            throw new AppError({
              code: ErrorCode.INVALID_INPUT,
              message: 'baseUrl is required for openai-compatible providers',
            })
          }
          if (input.apiKey) replacementRef = await deps.encryptSecret(input.apiKey)
          const fields: ConnectionUpdate = { updatedAt: new Date().toISOString() }
          if (input.name !== undefined) fields.name = input.name
          if (input.type !== undefined) fields.type = input.type
          if (input.baseUrl !== undefined) fields.baseUrl = input.baseUrl
          if (input.enabled !== undefined) fields.enabled = input.enabled
          if (replacementRef) {
            fields.secretRef = replacementRef
            fields.status = 'untested'
          }
          const updated = await deps.connections.update(existing.id, fields)
          if (!updated) return notFound(c, 'Connection')
          replacementCommitted = Boolean(replacementRef)
          if (replacementRef && !existing.secretRef.startsWith('env:')) {
            // The connection already references the replacement. Old-row cleanup is
            // best-effort so a cleanup failure cannot invalidate the committed reference.
            await deps.deleteSecret(existing.secretRef).catch(() => undefined)
          }
          return c.json(publicConnection(updated))
        } catch (error) {
          if (replacementRef && !replacementCommitted) {
            await deps.deleteSecret(replacementRef).catch(() => undefined)
          }
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/connections/:id', {
      method: 'DELETE',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const existing = await deps.connections.find(c.req.param('id'))
          if (!existing) return notFound(c, 'Connection')
          if (!(await deps.connections.remove(existing.id))) return notFound(c, 'Connection')
          if (!existing.secretRef.startsWith('env:')) await deps.deleteSecret(existing.secretRef)
          return c.json({ deleted: true })
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/connections/test', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const { connectionId } = connectionIdSchema.parse(await c.req.json())
          const connection = await deps.connections.find(connectionId)
          if (!connection) return notFound(c, 'Connection')
          const apiKey = await deps.resolveSecret(connection.secretRef)
          const result = await deps
            .getAdapter(connection.type)
            .validateConnection(connection.baseUrl ?? undefined, apiKey)
          await deps.connections.update(connection.id, {
            status: result.ok ? 'healthy' : 'unavailable',
          })
          return c.json(result)
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/models/discovered', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const { connectionId } = connectionIdSchema.parse({
            connectionId: c.req.query('connectionId'),
          })
          const connection = await deps.connections.find(connectionId)
          if (!connection) return notFound(c, 'Connection')
          const apiKey = await deps.resolveSecret(connection.secretRef)
          return c.json(
            await deps
              .getAdapter(connection.type)
              .listModels(connection.baseUrl ?? undefined, apiKey),
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/models/profiles', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.profiles.list())
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/models/profiles', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = profileCreateSchema.parse(await c.req.json())
          if (!(await deps.connections.find(input.providerConnectionId)))
            return notFound(c, 'Connection')
          return c.json(
            await deps.profiles.create({
              id: randomUUID(),
              providerConnectionId: input.providerConnectionId,
              modelId: input.modelId,
              displayName: input.displayName,
              capabilities: input.capabilities,
              approved: input.approved ?? false,
              enabled: input.enabled ?? true,
              ...(input.defaultSettings !== undefined
                ? { defaultSettings: normalizeSettings(input.defaultSettings) }
                : {}),
            }),
            201,
          )
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/models/profiles/:id', {
      method: 'PATCH',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = profileUpdateSchema.parse(await c.req.json())
          const fields: ProfileUpdate = { updatedAt: new Date().toISOString() }
          if (input.displayName !== undefined) fields.displayName = input.displayName
          if (input.capabilities !== undefined) fields.capabilities = input.capabilities
          if (input.approved !== undefined) fields.approved = input.approved
          if (input.enabled !== undefined) fields.enabled = input.enabled
          if (input.defaultSettings !== undefined) {
            fields.defaultSettings = normalizeSettings(input.defaultSettings)
          }
          const updated = await deps.profiles.update(c.req.param('id'), fields)
          return updated ? c.json(updated) : notFound(c, 'Profile')
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/bindings', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        try {
          return c.json(await deps.bindings.list())
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
    registerApiRoute('/api/providers/bindings', {
      method: 'POST',
      requiresAuth: false,
      handler: async (c) => {
        try {
          const input = bindingSchema.parse(await c.req.json())
          const ids = [input.primaryModelProfileId, ...input.fallbackModelProfileIds]
          if (new Set(ids).size !== ids.length)
            throw new AppError({
              code: ErrorCode.INVALID_INPUT,
              message: 'Model profile IDs must be unique',
            })
          const profiles = await Promise.all(ids.map((id) => deps.profiles.find(id)))
          if (profiles.some((profile) => !profile?.approved || !profile.enabled)) {
            throw new AppError({
              code: ErrorCode.INVALID_INPUT,
              message: 'Bindings require approved and enabled model profiles',
            })
          }
          return c.json(await deps.bindings.upsert(input))
        } catch (error) {
          return errorResponse(c, error)
        }
      },
    }),
  ]
}

const productionDependencies: ProviderRouteDependencies = {
  connections: {
    list: () => db.query.providerConnections.findMany(),
    find: (id) =>
      db.query.providerConnections.findFirst({
        where: (fields, operators) => operators.eq(fields.id, id),
      }),
    create: async (value) =>
      (await db.insert(providerConnections).values(value).returning())[0] as Connection,
    update: async (id, value) =>
      (
        await db
          .update(providerConnections)
          .set(value)
          .where(eq(providerConnections.id, id))
          .returning()
      )[0],
    remove: async (id) =>
      (await db.delete(providerConnections).where(eq(providerConnections.id, id)).returning())
        .length > 0,
  },
  profiles: {
    list: () => db.query.modelProfiles.findMany(),
    find: (id) =>
      db.query.modelProfiles.findFirst({
        where: (fields, operators) => operators.eq(fields.id, id),
      }),
    create: async (value) =>
      (await db.insert(modelProfiles).values(value).returning())[0] as Profile,
    update: async (id, value) =>
      (await db.update(modelProfiles).set(value).where(eq(modelProfiles.id, id)).returning())[0],
  },
  bindings: {
    list: () => db.query.agentModelBindings.findMany(),
    upsert: async (value) =>
      (
        await db
          .insert(agentModelBindings)
          .values(value)
          .onConflictDoUpdate({
            target: agentModelBindings.agentId,
            set: {
              primaryModelProfileId: value.primaryModelProfileId,
              fallbackModelProfileIds: value.fallbackModelProfileIds,
              updatedAt: new Date().toISOString(),
            },
          })
          .returning()
      )[0] as Binding,
  },
  encryptSecret,
  deleteSecret: async (secretRef) => {
    await db.delete(aetherSecrets).where(eq(aetherSecrets.id, secretRef))
  },
  resolveSecret,
  getAdapter,
  validateBaseUrl: async (url) => {
    await validateUrl(url)
  },
}

export const providerRoutes = createProviderRoutes(productionDependencies)
