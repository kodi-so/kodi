import type { Hono } from 'hono'
import { TRPCError } from '@trpc/server'
import { db } from '@kodi/db'
import { z } from 'zod'
import {
  createBridgeMemoryDbAccess,
  readBridgeMemoryHeaders,
  resolveBridgeMemoryAuthContext,
  resolveBridgeMemoryScope,
  resolveBridgeMemorySearchScope,
  type BridgeMemoryAuthAccess,
} from '../lib/memory/bridge'
import {
  getMemoryManifest,
  listMemoryDirectory,
  readMemoryPath,
  searchMemory,
} from '../lib/memory/service'
import type { MemoryStorage } from '../lib/memory/storage'

const memoryScopeSchema = z.enum(['org', 'member'])
const memorySearchScopeSchema = z.enum(['org', 'member', 'all'])

const manifestBodySchema = z.object({
  scope: memoryScopeSchema,
})

const listBodySchema = z.object({
  scope: memoryScopeSchema,
  path: z.string().trim().optional(),
})

const readBodySchema = z.object({
  scope: memoryScopeSchema,
  path: z.string().trim().min(1),
})

const searchBodySchema = z.object({
  scope: memorySearchScopeSchema.default('all'),
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(10),
})

type OpenClawMemoryRouteOptions = {
  database?: typeof db
  storage?: MemoryStorage
  authAccess?: BridgeMemoryAuthAccess
}

type MemoryRouteStatus = 400 | 401 | 403 | 404 | 500 | 501

function bridgeOrgMemberId(orgMemberId: string | null) {
  return orgMemberId ?? ''
}

function errorResponse(error: string, code?: string) {
  return {
    error,
    ...(code ? { code } : {}),
  }
}

export function registerOpenClawMemoryRoutes(
  app: Hono,
  options: OpenClawMemoryRouteOptions = {}
) {
  const database = options.database ?? db
  const authAccess =
    options.authAccess ?? createBridgeMemoryDbAccess(database)

  app.post('/api/openclaw/memory/:tool', async (c) => {
    try {
      const tool = c.req.param('tool')
      const headers = readBridgeMemoryHeaders({
        authorization: c.req.header('authorization') ?? null,
        'x-kb-agent-id': c.req.header('x-kb-agent-id') ?? null,
        'x-kb-session-key': c.req.header('x-kb-session-key') ?? null,
        'x-kb-tool-call-id': c.req.header('x-kb-tool-call-id') ?? null,
      })

      const auth = await resolveBridgeMemoryAuthContext(authAccess, headers)
      if (!auth.ok) {
        return c.json(
          errorResponse(auth.error, auth.code),
          asRouteStatus(auth.status)
        )
      }

      if (tool === 'ping') {
        return c.json({
          pong: true,
          agentId: auth.value.agentId,
          orgId: auth.value.orgId,
          agentType: auth.value.agentType,
          allowedScopes: auth.value.allowedScopes,
          sessionKey: auth.value.sessionKey,
          toolCallId: auth.value.toolCallId,
        })
      }

      const rawBody = await c.req.json().catch(() => ({}))

      switch (tool) {
        case 'manifest': {
          const parsed = manifestBodySchema.safeParse(rawBody)
          if (!parsed.success) {
            return c.json(
              errorResponse('Invalid manifest request body.', 'bad-request'),
              400
            )
          }

          const scope = resolveBridgeMemoryScope(auth.value, parsed.data.scope)
          if (!scope.ok) {
            return c.json(
              errorResponse(scope.error, scope.code),
              asRouteStatus(scope.status)
            )
          }

          const result = await getMemoryManifest(database, {
            orgId: auth.value.orgId,
            orgMemberId: bridgeOrgMemberId(auth.value.orgMemberId),
            scope: scope.value,
            storage: options.storage,
          })

          return c.json(result)
        }

        case 'list': {
          const parsed = listBodySchema.safeParse(rawBody)
          if (!parsed.success) {
            return c.json(
              errorResponse('Invalid list request body.', 'bad-request'),
              400
            )
          }

          const scope = resolveBridgeMemoryScope(auth.value, parsed.data.scope)
          if (!scope.ok) {
            return c.json(
              errorResponse(scope.error, scope.code),
              asRouteStatus(scope.status)
            )
          }

          const result = await listMemoryDirectory(database, {
            orgId: auth.value.orgId,
            orgMemberId: bridgeOrgMemberId(auth.value.orgMemberId),
            scope: scope.value,
            path: parsed.data.path,
          })

          return c.json(result)
        }

        case 'read': {
          const parsed = readBodySchema.safeParse(rawBody)
          if (!parsed.success) {
            return c.json(
              errorResponse('Invalid read request body.', 'bad-request'),
              400
            )
          }

          const scope = resolveBridgeMemoryScope(auth.value, parsed.data.scope)
          if (!scope.ok) {
            return c.json(
              errorResponse(scope.error, scope.code),
              asRouteStatus(scope.status)
            )
          }

          const result = await readMemoryPath(database, {
            orgId: auth.value.orgId,
            orgMemberId: bridgeOrgMemberId(auth.value.orgMemberId),
            scope: scope.value,
            path: parsed.data.path,
            storage: options.storage,
          })

          return c.json(result)
        }

        case 'search': {
          const parsed = searchBodySchema.safeParse(rawBody)
          if (!parsed.success) {
            return c.json(
              errorResponse('Invalid search request body.', 'bad-request'),
              400
            )
          }

          const scope = resolveBridgeMemorySearchScope(
            auth.value,
            parsed.data.scope
          )
          if (!scope.ok) {
            return c.json(
              errorResponse(scope.error, scope.code),
              asRouteStatus(scope.status)
            )
          }

          const result = await searchMemory(database, {
            orgId: auth.value.orgId,
            orgMemberId: bridgeOrgMemberId(auth.value.orgMemberId),
            scope: scope.value,
            query: parsed.data.query,
            limit: parsed.data.limit,
            storage: options.storage,
          })

          return c.json(result)
        }

        default:
          return c.json(
            {
              error: `Memory tool "${tool}" is not implemented yet.`,
              code: 'not-implemented',
            },
            501
          )
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        return c.json(
          {
            error: error.message,
            code: error.code,
          },
          trpcStatusToHttpStatus(error.code)
        )
      }

      console.error('[openclaw-memory] request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return c.json(
        {
          error: 'Bridge memory request failed.',
          code: 'internal-server-error',
        },
        500
      )
    }
  })
}

function trpcStatusToHttpStatus(code: TRPCError['code']) {
  switch (code) {
    case 'BAD_REQUEST':
      return 400
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    default:
      return 500
  }
}

function asRouteStatus(status: number) {
  return status as MemoryRouteStatus
}
