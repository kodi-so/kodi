import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'
import { getFeatureFlags } from '../../lib/features'
import {
  choosePrimaryConnection,
  createConnectLink,
  disableConnectedAccount,
  getToolAccessPresentation,
  getToolAccessSetupStatus,
  listPersistedConnections,
  listToolkits,
  markPersistedConnectionInactive,
  syncUserConnectionsForOrg,
} from '../../lib/composio'
import { logActivity } from '../../lib/activity'

const attentionStatuses = new Set(['FAILED', 'EXPIRED'])

function buildConnectionSummary(
  connections: Awaited<ReturnType<typeof listPersistedConnections>>
) {
  const activeCount = connections.filter(
    (connection) => connection.connectedAccountStatus === 'ACTIVE'
  ).length
  const attentionCount = connections.filter((connection) =>
    attentionStatuses.has(connection.connectedAccountStatus ?? 'UNKNOWN')
  ).length

  return {
    totalCount: connections.length,
    activeCount,
    attentionCount,
  }
}

async function loadConnectionsForCurrentUser(params: {
  db: Parameters<typeof listPersistedConnections>[0]
  orgId: string
  userId: string
}) {
  const setup = getToolAccessSetupStatus()
  let syncError: string | null = null

  if (setup.apiConfigured) {
    try {
      await syncUserConnectionsForOrg(params.db, params.orgId, params.userId)
    } catch (error) {
      syncError =
        error instanceof Error
          ? error.message
          : 'Failed to sync Composio accounts.'
    }
  }

  const connections = await listPersistedConnections(
    params.db,
    params.orgId,
    params.userId
  )

  return {
    connections,
    setup,
    syncError,
    summary: buildConnectionSummary(connections),
  }
}

export const toolAccessRouter = router({
  getStatus: memberProcedure.query(async ({ ctx }) => {
    const result = await loadConnectionsForCurrentUser({
      db: ctx.db,
      orgId: ctx.org.id,
      userId: ctx.session.user.id,
    })

    return {
      featureFlags: getFeatureFlags(),
      setup: result.setup,
      summary: result.summary,
      syncError: result.syncError,
    }
  }),

  getCatalog: memberProcedure
    .input(
      z.object({
        search: z.string().trim().max(100).optional(),
        limit: z.number().int().min(1).max(60).default(24),
      })
    )
    .query(async ({ ctx, input }) => {
      const featureFlags = getFeatureFlags()
      const result = await loadConnectionsForCurrentUser({
        db: ctx.db,
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
      })

      const connectionsByToolkit = new Map<string, typeof result.connections>()
      for (const connection of result.connections) {
        const existing = connectionsByToolkit.get(connection.toolkitSlug) ?? []
        existing.push(connection)
        connectionsByToolkit.set(connection.toolkitSlug, existing)
      }

      const toolkits = result.setup.apiConfigured
        ? await listToolkits(input.search, input.limit)
        : []

      const items = toolkits.map((toolkit) => {
        const connections = connectionsByToolkit.get(toolkit.slug) ?? []
        const primaryConnection = choosePrimaryConnection(connections)

        return {
          ...toolkit,
          ...getToolAccessPresentation(toolkit),
          connection: primaryConnection
            ? {
                id: primaryConnection.id,
                connectedAccountId: primaryConnection.connectedAccountId,
                status: primaryConnection.connectedAccountStatus ?? 'UNKNOWN',
                connectedAccountLabel: primaryConnection.connectedAccountLabel,
                externalUserEmail: primaryConnection.externalUserEmail,
                externalUserId: primaryConnection.externalUserId,
                errorMessage: primaryConnection.errorMessage,
                updatedAt: primaryConnection.updatedAt,
              }
            : null,
          connectionCount: connections.length,
        }
      })

      return {
        featureFlags,
        setup: result.setup,
        summary: result.summary,
        syncError: result.syncError,
        items,
      }
    }),

  createConnectLink: memberProcedure
    .input(
      z.object({
        toolkitSlug: z.string().min(1),
        returnPath: z.string().startsWith('/').optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!getFeatureFlags().toolAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tool access is disabled in this environment.',
        })
      }

      const setup = getToolAccessSetupStatus()
      if (!setup.apiConfigured) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Composio is not configured in this environment.',
        })
      }

      const result = await createConnectLink({
        userId: ctx.session.user.id,
        toolkitSlug: input.toolkitSlug,
        returnPath: input.returnPath,
      })

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.connection_requested',
        {
          toolkitSlug: result.toolkit.slug,
          toolkitName: result.toolkit.name,
          authConfigId: result.authConfigId,
          authConfigSource: result.authConfigSource,
          connectedAccountId: result.connectedAccountId,
        },
        ctx.session.user.id
      )

      return result
    }),

  disconnect: memberProcedure
    .input(
      z.object({
        connectedAccountId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.toolkitConnections.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.userId, ctx.session.user.id),
            eq(fields.connectedAccountId, input.connectedAccountId)
          ),
      })

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool connection not found for this workspace.',
        })
      }

      await disableConnectedAccount(existing.connectedAccountId)
      await markPersistedConnectionInactive(ctx.db, existing.id)

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.connection_disabled',
        {
          toolkitSlug: existing.toolkitSlug,
          connectedAccountId: existing.connectedAccountId,
        },
        ctx.session.user.id
      )

      return { success: true }
    }),
})
