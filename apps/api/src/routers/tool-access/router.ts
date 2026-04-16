import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { eq, toolkitPolicies } from '@kodi/db'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { getFeatureFlags } from '../../lib/features'
import {
  choosePrimaryConnection,
  clearToolkitAccountPreference,
  createConnectLink,
  disableConnectedAccount,
  getComposioClient,
  getEffectiveToolkitPolicy,
  getToolkit,
  getToolAccessPresentation,
  getToolAccessSetupStatus,
  listPersistedConnections,
  listToolkitAccountPreferences,
  listToolkitPolicies,
  listToolkits,
  markMetadataUserDisconnected,
  markPersistedConnectionInactive,
  revalidatePersistedConnection,
  syncUserConnectionsForOrg,
  upsertToolkitAccountPreference,
} from '../../lib/composio'
import { logActivity } from '../../lib/activity'

const attentionStatuses = new Set(['FAILED', 'EXPIRED'])

type PersistedConnection = Awaited<
  ReturnType<typeof listPersistedConnections>
>[number]
type PersistedPolicy = Awaited<ReturnType<typeof listToolkitPolicies>>[number]
type PersistedPreference = Awaited<
  ReturnType<typeof listToolkitAccountPreferences>
>[number]

function getDisplayableConnections<
  T extends { connectedAccountStatus?: string | null },
>(connections: T[]) {
  return connections.filter(
    (connection) => connection.connectedAccountStatus !== 'INACTIVE'
  )
}

function buildConnectionSummary(connections: PersistedConnection[]) {
  const displayableConnections = getDisplayableConnections(connections)
  const activeCount = displayableConnections.filter(
    (connection) => connection.connectedAccountStatus === 'ACTIVE'
  ).length
  const attentionCount = displayableConnections.filter((connection) =>
    attentionStatuses.has(connection.connectedAccountStatus ?? 'UNKNOWN')
  ).length

  return {
    totalCount: displayableConnections.length,
    activeCount,
    attentionCount,
  }
}

function serializeConnection(
  connection: PersistedConnection,
  preferredConnectedAccountId: string | null
) {
  return {
    id: connection.id,
    connectedAccountId: connection.connectedAccountId,
    status: connection.connectedAccountStatus ?? 'UNKNOWN',
    connectedAccountLabel: connection.connectedAccountLabel,
    externalUserEmail: connection.externalUserEmail,
    externalUserId: connection.externalUserId,
    scopes: connection.scopes ?? [],
    errorMessage: connection.errorMessage,
    lastValidatedAt: connection.lastValidatedAt,
    lastErrorAt: connection.lastErrorAt,
    updatedAt: connection.updatedAt,
    isPreferred: preferredConnectedAccountId === connection.connectedAccountId,
  }
}

function sortConnectionsForDetail(
  connections: PersistedConnection[],
  preferredConnectedAccountId: string | null
) {
  return [...connections].sort((left, right) => {
    const leftPreferred =
      preferredConnectedAccountId === left.connectedAccountId ? 1 : 0
    const rightPreferred =
      preferredConnectedAccountId === right.connectedAccountId ? 1 : 0
    if (leftPreferred !== rightPreferred) {
      return rightPreferred - leftPreferred
    }

    const leftActive = left.connectedAccountStatus === 'ACTIVE' ? 1 : 0
    const rightActive = right.connectedAccountStatus === 'ACTIVE' ? 1 : 0
    if (leftActive !== rightActive) {
      return rightActive - leftActive
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime()
  })
}

async function loadConnectionsForCurrentUser(params: {
  db: Parameters<typeof listPersistedConnections>[0]
  orgId: string
  userId: string
  toolkitSlugs?: string[]
}) {
  const setup = getToolAccessSetupStatus()
  let syncError: string | null = null

  if (setup.apiConfigured) {
    try {
      await syncUserConnectionsForOrg(
        params.db,
        params.orgId,
        params.userId,
        params.toolkitSlugs
      )
    } catch (error) {
      syncError =
        error instanceof Error
          ? error.message
          : 'Failed to sync Composio accounts.'
    }
  }

  const [connections, policies, preferences] = await Promise.all([
    listPersistedConnections(params.db, params.orgId, params.userId),
    listToolkitPolicies(params.db, params.orgId),
    listToolkitAccountPreferences(params.db, params.orgId, params.userId),
  ])

  return {
    connections,
    policies,
    preferences,
    setup,
    syncError,
    summary: buildConnectionSummary(connections),
  }
}

const policyInput = z.object({
  toolkitSlug: z.string().min(1),
  enabled: z.boolean(),
  chatReadsEnabled: z.boolean(),
  meetingReadsEnabled: z.boolean(),
  draftsEnabled: z.boolean(),
  writesRequireApproval: z.boolean(),
  adminActionsEnabled: z.boolean(),
})

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

  // Lightweight DB-only check — no Composio sync. Used to gate UI elements.
  checkConnections: memberProcedure
    .input(
      z.object({
        toolkitSlugs: z.array(z.string().min(1)).min(1).max(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const connections = await ctx.db.query.toolkitConnections.findMany({
        where: (fields, { and, eq, inArray }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.userId, ctx.session.user.id),
            eq(fields.connectedAccountStatus, 'ACTIVE'),
            inArray(fields.toolkitSlug, input.toolkitSlugs)
          ),
        columns: { toolkitSlug: true },
      })

      return Object.fromEntries(
        input.toolkitSlugs.map((slug) => [
          slug,
          connections.some((c) => c.toolkitSlug === slug),
        ])
      ) as Record<string, boolean>
    }),

  // Returns toolkit-level defaults stored in policy metadata (e.g. Slack default channel).
  getToolkitDefaults: memberProcedure
    .input(z.object({ toolkitSlug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.db.query.toolkitPolicies.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.toolkitSlug, input.toolkitSlug)
          ),
        columns: { metadata: true },
      })

      const meta = policy?.metadata ?? null
      const defaultChannel =
        meta && typeof meta['defaultChannel'] === 'string' && meta['defaultChannel'].trim()
          ? (meta['defaultChannel'] as string).trim()
          : null

      return { defaultChannel }
    }),

  // Saves toolkit-level defaults to policy metadata. Owner only.
  setDefaultChannel: ownerProcedure
    .input(
      z.object({
        toolkitSlug: z.string().min(1),
        channel: z.string().trim().max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.toolkitPolicies.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.toolkitSlug, input.toolkitSlug)
          ),
      })

      const channel = input.channel.replace(/^#/, '').trim()
      const updatedMetadata = {
        ...(existing?.metadata ?? {}),
        defaultChannel: channel || null,
      }

      if (existing) {
        await ctx.db
          .update(toolkitPolicies)
          .set({ metadata: updatedMetadata, updatedAt: new Date(), updatedByUserId: ctx.session.user.id })
          .where(eq(toolkitPolicies.id, existing.id))
      } else {
        await ctx.db.insert(toolkitPolicies).values({
          orgId: ctx.org.id,
          toolkitSlug: input.toolkitSlug,
          metadata: updatedMetadata,
          createdByUserId: ctx.session.user.id,
          updatedByUserId: ctx.session.user.id,
        })
      }

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.defaults_updated',
        { toolkitSlug: input.toolkitSlug, defaultChannel: channel || null },
        ctx.session.user.id
      )

      return { defaultChannel: channel || null }
    }),

  // Executes SLACK_LIST_CHANNELS via a short-lived Composio session and returns
  // the channel list for display in the recap-delivery modal. Read-only; no DB
  // audit records are written.
  listSlackChannels: memberProcedure.query(async ({ ctx }) => {
    const setup = getToolAccessSetupStatus()
    if (!setup.apiConfigured) {
      return { channels: [] as Array<{ id: string; name: string }> }
    }

    const connections = await listPersistedConnections(ctx.db, ctx.org.id, ctx.session.user.id)
    const preferences = await listToolkitAccountPreferences(ctx.db, ctx.org.id, ctx.session.user.id)

    const slackConnections = connections.filter((c) => c.toolkitSlug === 'slack')
    const preference = preferences.find((p) => p.toolkitSlug === 'slack')
    const connection = choosePrimaryConnection(
      slackConnections,
      preference?.preferredConnectedAccountId ?? null
    )

    if (!connection || connection.connectedAccountStatus !== 'ACTIVE') {
      return { channels: [] as Array<{ id: string; name: string }> }
    }

    try {
      const composio = getComposioClient()
      const session = await composio.create(ctx.session.user.id, {
        toolkits: { enable: ['slack'] },
        connectedAccounts: { slack: connection.connectedAccountId },
        authConfigs: connection.authConfigId
          ? { slack: connection.authConfigId }
          : undefined,
        manageConnections: { enable: false, waitForConnections: false },
        workbench: { enable: false, enableProxyExecution: false },
      })

      const scoped = await composio.toolRouter.use(session.sessionId)
      const response = (await scoped.execute('SLACK_LIST_CHANNELS', {
        exclude_archived: true,
        limit: 200,
      })) as { data?: Record<string, unknown>; error?: string | null }

      if (response.error || !response.data) {
        return { channels: [] as Array<{ id: string; name: string }> }
      }

      // Composio wraps the Slack API response under data
      const raw = response.data
      const channelsRaw =
        Array.isArray(raw['channels'])
          ? (raw['channels'] as Array<Record<string, unknown>>)
          : Array.isArray((raw['data'] as Record<string, unknown> | undefined)?.['channels'])
            ? ((raw['data'] as Record<string, unknown>)['channels'] as Array<Record<string, unknown>>)
            : []

      const channels = channelsRaw
        .filter((c) => typeof c['name'] === 'string' && typeof c['id'] === 'string')
        .map((c) => ({ id: c['id'] as string, name: c['name'] as string }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return { channels }
    } catch {
      // Non-fatal: fall back to manual text entry
      return { channels: [] as Array<{ id: string; name: string }> }
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

      const connectionsByToolkit = new Map<string, PersistedConnection[]>()
      for (const connection of result.connections) {
        const existing = connectionsByToolkit.get(connection.toolkitSlug) ?? []
        existing.push(connection)
        connectionsByToolkit.set(connection.toolkitSlug, existing)
      }

      const policiesByToolkit = new Map<string, PersistedPolicy>(
        result.policies.map((policy) => [policy.toolkitSlug, policy])
      )
      const preferencesByToolkit = new Map<string, PersistedPreference>(
        result.preferences.map((preference) => [
          preference.toolkitSlug,
          preference,
        ])
      )

      const toolkits = result.setup.apiConfigured
        ? await listToolkits(input.search, input.limit)
        : []

      const items = toolkits.map((toolkit) => {
        const connections = getDisplayableConnections(
          connectionsByToolkit.get(toolkit.slug) ?? []
        )
        const preference = preferencesByToolkit.get(toolkit.slug) ?? null
        const effectivePolicy = getEffectiveToolkitPolicy(
          policiesByToolkit.get(toolkit.slug) ?? null,
          toolkit.slug
        )
        const primaryConnection = choosePrimaryConnection(
          connections,
          preference?.preferredConnectedAccountId ?? null
        )

        return {
          ...toolkit,
          ...getToolAccessPresentation(toolkit),
          policy: effectivePolicy,
          selectedConnectedAccountId:
            preference?.preferredConnectedAccountId ?? null,
          connection: primaryConnection
            ? {
                ...serializeConnection(
                  primaryConnection,
                  preference?.preferredConnectedAccountId ?? null
                ),
                selectionMode: preference ? 'preferred' : 'automatic',
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

  getToolkitDetail: memberProcedure
    .input(
      z.object({
        toolkitSlug: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const featureFlags = getFeatureFlags()
      const result = await loadConnectionsForCurrentUser({
        db: ctx.db,
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
        toolkitSlugs: [input.toolkitSlug],
      })

      if (!result.setup.apiConfigured) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Composio is not configured in this environment.',
        })
      }

      const toolkit = await getToolkit(input.toolkitSlug).catch((error) => {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message:
            error instanceof Error
              ? error.message
              : 'Toolkit not found in the Composio catalog.',
        })
      })

      const connections = result.connections.filter(
        (connection) => connection.toolkitSlug === toolkit.slug
      )
      const displayableConnections = getDisplayableConnections(connections)
      const preference =
        result.preferences.find((item) => item.toolkitSlug === toolkit.slug) ??
        null
      const policy =
        result.policies.find((item) => item.toolkitSlug === toolkit.slug) ??
        null
      const sortedConnections = sortConnectionsForDetail(
        displayableConnections,
        preference?.preferredConnectedAccountId ?? null
      )

      return {
        featureFlags,
        setup: result.setup,
        syncError: result.syncError,
        toolkit: {
          ...toolkit,
          ...getToolAccessPresentation(toolkit),
        },
        connectionSummary: buildConnectionSummary(displayableConnections),
        selectedConnectedAccountId:
          preference?.preferredConnectedAccountId ?? null,
        connections: sortedConnections.map((connection) =>
          serializeConnection(
            connection,
            preference?.preferredConnectedAccountId ?? null
          )
        ),
        policy: getEffectiveToolkitPolicy(policy, toolkit.slug),
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

  setPreferredConnection: memberProcedure
    .input(
      z.object({
        toolkitSlug: z.string().min(1),
        connectedAccountId: z.string().min(1).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const connectedAccountId = input.connectedAccountId

      if (!connectedAccountId) {
        await clearToolkitAccountPreference(ctx.db, {
          orgId: ctx.org.id,
          userId: ctx.session.user.id,
          toolkitSlug: input.toolkitSlug,
        })

        await logActivity(
          ctx.db,
          ctx.org.id,
          'tool_access.connection_selection_cleared',
          {
            toolkitSlug: input.toolkitSlug,
          },
          ctx.session.user.id
        )

        return { preferredConnectedAccountId: null }
      }

      const connection = await ctx.db.query.toolkitConnections.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.orgId, ctx.org.id),
            eq(fields.userId, ctx.session.user.id),
            eq(fields.toolkitSlug, input.toolkitSlug),
            eq(fields.connectedAccountId, connectedAccountId)
          ),
      })

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connected account not found for this toolkit.',
        })
      }

      if (connection.connectedAccountStatus === 'INACTIVE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Reconnect this account before selecting it again.',
        })
      }

      await upsertToolkitAccountPreference(ctx.db, {
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
        toolkitSlug: input.toolkitSlug,
        preferredConnectedAccountId: connectedAccountId,
      })

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.connection_selected',
        {
          toolkitSlug: input.toolkitSlug,
          connectedAccountId,
        },
        ctx.session.user.id
      )

      return { preferredConnectedAccountId: connectedAccountId }
    }),

  updatePolicy: ownerProcedure
    .input(policyInput)
    .mutation(async ({ ctx, input }) => {
      const [saved] = await ctx.db
        .insert(toolkitPolicies)
        .values({
          orgId: ctx.org.id,
          toolkitSlug: input.toolkitSlug,
          enabled: input.enabled,
          chatReadsEnabled: input.chatReadsEnabled,
          meetingReadsEnabled: input.meetingReadsEnabled,
          draftsEnabled: input.draftsEnabled,
          writesRequireApproval: input.writesRequireApproval,
          adminActionsEnabled: input.adminActionsEnabled,
          allowedActionPatterns: [],
          createdByUserId: ctx.session.user.id,
          updatedByUserId: ctx.session.user.id,
          metadata: {
            managedIn: 'phase-2-settings',
          },
        })
        .onConflictDoUpdate({
          target: [toolkitPolicies.orgId, toolkitPolicies.toolkitSlug],
          set: {
            enabled: input.enabled,
            chatReadsEnabled: input.chatReadsEnabled,
            meetingReadsEnabled: input.meetingReadsEnabled,
            draftsEnabled: input.draftsEnabled,
            writesRequireApproval: input.writesRequireApproval,
            adminActionsEnabled: input.adminActionsEnabled,
            updatedByUserId: ctx.session.user.id,
            updatedAt: new Date(),
            metadata: {
              managedIn: 'phase-2-settings',
            },
          },
        })
        .returning()

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.policy_updated',
        {
          toolkitSlug: input.toolkitSlug,
          enabled: input.enabled,
          chatReadsEnabled: input.chatReadsEnabled,
          meetingReadsEnabled: input.meetingReadsEnabled,
          draftsEnabled: input.draftsEnabled,
          writesRequireApproval: input.writesRequireApproval,
          adminActionsEnabled: input.adminActionsEnabled,
        },
        ctx.session.user.id
      )

      return getEffectiveToolkitPolicy(saved ?? null, input.toolkitSlug)
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

      if (existing.connectedAccountStatus === 'ACTIVE') {
        await disableConnectedAccount(existing.connectedAccountId)
      }
      await markPersistedConnectionInactive(
        ctx.db,
        existing.id,
        markMetadataUserDisconnected(existing.metadata ?? null)
      )

      const existingPreference =
        (
          await listToolkitAccountPreferences(
            ctx.db,
            ctx.org.id,
            ctx.session.user.id
          )
        ).find(
          (preference) => preference.toolkitSlug === existing.toolkitSlug
        ) ?? null

      if (
        existingPreference?.preferredConnectedAccountId ===
        existing.connectedAccountId
      ) {
        await clearToolkitAccountPreference(ctx.db, {
          orgId: ctx.org.id,
          userId: ctx.session.user.id,
          toolkitSlug: existing.toolkitSlug,
        })
      }

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

  revalidateConnection: memberProcedure
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

      const refreshed = await revalidatePersistedConnection(ctx.db, existing)

      await logActivity(
        ctx.db,
        ctx.org.id,
        'tool_access.connection_revalidated',
        {
          toolkitSlug: existing.toolkitSlug,
          connectedAccountId: existing.connectedAccountId,
          resultingStatus: refreshed?.connectedAccountStatus ?? 'INACTIVE',
        },
        ctx.session.user.id
      )

      return {
        connection: refreshed ? serializeConnection(refreshed, null) : null,
      }
    }),
})
