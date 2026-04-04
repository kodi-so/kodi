import { AuthConfigTypes, Composio } from '@composio/core'
import { and, eq } from 'drizzle-orm'
import {
  db,
  toolkitAccountPreferences,
  toolkitConnections,
  toolkitPolicies,
  type ToolkitConnection,
  type ToolkitPolicy,
} from '@kodi/db'
import { env } from '../env'

const TIER_ONE_TOOLKITS = new Set([
  'gmail',
  'googlecalendar',
  'slack',
  'github',
  'linear',
  'notion',
])

const TIER_TWO_TOOLKITS = new Set([
  'jira',
  'googledrive',
  'hubspot',
  'confluence',
  'outlook',
  'microsoftoutlook',
])

const CUSTOM_AUTH_TOOLKITS = new Set([
  'gmail',
  'googlecalendar',
  'slack',
  'github',
])

type AnyDb = typeof db

type ToolkitSummary = {
  slug: string
  name: string
  description: string | null
  logo: string | null
  appUrl: string | null
  categories: Array<{ slug: string; name: string }>
  toolsCount: number
  triggersCount: number
  isLocalToolkit: boolean
  authSchemes: string[]
  composioManagedAuthSchemes: string[]
  noAuth: boolean
}

type ConnectionSummary = {
  id: string
  authConfigId: string | null
  status: string
  userId: string | null
  toolkitSlug: string
  toolkitName: string | null
  externalUserEmail: string | null
  externalUserId: string | null
  connectedAccountLabel: string | null
  scopes: string[]
  metadata: Record<string, unknown> | null
}

const ACCOUNT_ATTENTION_STATUSES = new Set(['FAILED', 'EXPIRED'])

function getConnectionErrorMessage(status: string) {
  switch (status) {
    case 'FAILED':
      return 'Connection requires attention in Composio.'
    case 'EXPIRED':
      return 'Connection expired and needs to be reconnected.'
    default:
      return null
  }
}

export type EffectiveToolkitPolicy = {
  id: string | null
  toolkitSlug: string
  enabled: boolean
  chatReadsEnabled: boolean
  meetingReadsEnabled: boolean
  draftsEnabled: boolean
  writesRequireApproval: boolean
  adminActionsEnabled: boolean
  allowedActionPatterns: string[]
  source: 'default' | 'saved'
  createdByUserId: string | null
  updatedByUserId: string | null
  updatedAt: Date | null
}

export function getDefaultToolkitPolicy(
  toolkitSlug: string
): EffectiveToolkitPolicy {
  return {
    id: null,
    toolkitSlug,
    enabled: true,
    chatReadsEnabled: true,
    meetingReadsEnabled: true,
    draftsEnabled: true,
    writesRequireApproval: true,
    adminActionsEnabled: false,
    allowedActionPatterns: [],
    source: 'default',
    createdByUserId: null,
    updatedByUserId: null,
    updatedAt: null,
  }
}

export function getEffectiveToolkitPolicy(
  policy: ToolkitPolicy | null | undefined,
  toolkitSlug: string
): EffectiveToolkitPolicy {
  if (!policy) {
    return getDefaultToolkitPolicy(toolkitSlug)
  }

  return {
    id: policy.id,
    toolkitSlug,
    enabled: policy.enabled,
    chatReadsEnabled: policy.chatReadsEnabled,
    meetingReadsEnabled: policy.meetingReadsEnabled,
    draftsEnabled: policy.draftsEnabled,
    writesRequireApproval: policy.writesRequireApproval,
    adminActionsEnabled: policy.adminActionsEnabled,
    allowedActionPatterns: policy.allowedActionPatterns ?? [],
    source: 'saved',
    createdByUserId: policy.createdByUserId,
    updatedByUserId: policy.updatedByUserId,
    updatedAt: policy.updatedAt,
  }
}

export function getComposioClient() {
  if (!env.COMPOSIO_API_KEY) {
    throw new Error('COMPOSIO_API_KEY is not configured.')
  }

  return new Composio({
    apiKey: env.COMPOSIO_API_KEY,
    baseURL: env.COMPOSIO_BASE_URL ?? undefined,
    host: 'kodi-api',
  })
}

function getNestedString(
  value: Record<string, unknown> | null | undefined,
  path: string[]
) {
  let current: unknown = value

  for (const key of path) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' && current.length > 0 ? current : null
}

function getNestedStringArray(
  value: Record<string, unknown> | null | undefined,
  path: string[]
) {
  let current: unknown = value

  for (const key of path) {
    if (!current || typeof current !== 'object') return []
    current = (current as Record<string, unknown>)[key]
  }

  if (Array.isArray(current)) {
    return current.filter((item): item is string => typeof item === 'string')
  }

  if (typeof current === 'string') {
    return current
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function getExternalLabel(account: Record<string, unknown>) {
  return (
    getNestedString(account, ['state', 'val', 'email']) ??
    getNestedString(account, ['state', 'email']) ??
    getNestedString(account, ['data', 'email']) ??
    getNestedString(account, ['state', 'val', 'name']) ??
    getNestedString(account, ['state', 'name']) ??
    getNestedString(account, ['data', 'name'])
  )
}

function getExternalEmail(account: Record<string, unknown>) {
  return (
    getNestedString(account, ['state', 'val', 'email']) ??
    getNestedString(account, ['state', 'email']) ??
    getNestedString(account, ['data', 'email'])
  )
}

function getExternalUserId(account: Record<string, unknown>) {
  return (
    getNestedString(account, ['state', 'val', 'id']) ??
    getNestedString(account, ['state', 'id']) ??
    getNestedString(account, ['data', 'id'])
  )
}

function getFirstStringArray(
  value: Record<string, unknown>,
  paths: string[][]
): string[] {
  for (const path of paths) {
    const items = getNestedStringArray(value, path)
    if (items.length > 0) return items
  }

  return []
}

function getScopes(account: Record<string, unknown>) {
  return getFirstStringArray(account, [
    ['state', 'val', 'scopes'],
    ['state', 'scopes'],
    ['data', 'scopes'],
    ['scopes'],
  ])
}

function getToolkitName(account: Record<string, unknown>) {
  return (
    getNestedString(account, ['toolkit', 'name']) ??
    getNestedString(account, ['toolkitName']) ??
    getNestedString(account, ['appName'])
  )
}

function normalizeToolkit(toolkit: Record<string, unknown>): ToolkitSummary {
  const meta =
    toolkit.meta && typeof toolkit.meta === 'object'
      ? (toolkit.meta as Record<string, unknown>)
      : {}

  const categories = Array.isArray(meta.categories)
    ? meta.categories
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const category = item as Record<string, unknown>
          const slug = typeof category.slug === 'string' ? category.slug : null
          const name = typeof category.name === 'string' ? category.name : null
          if (!slug || !name) return null
          return { slug, name }
        })
        .filter((item): item is { slug: string; name: string } => item !== null)
    : []

  return {
    slug: typeof toolkit.slug === 'string' ? toolkit.slug : 'unknown',
    name: typeof toolkit.name === 'string' ? toolkit.name : 'Unknown toolkit',
    description: typeof meta.description === 'string' ? meta.description : null,
    logo: typeof meta.logo === 'string' ? meta.logo : null,
    appUrl: typeof meta.appUrl === 'string' ? meta.appUrl : null,
    categories,
    toolsCount: typeof meta.toolsCount === 'number' ? meta.toolsCount : 0,
    triggersCount:
      typeof meta.triggersCount === 'number' ? meta.triggersCount : 0,
    isLocalToolkit: toolkit.isLocalToolkit === true,
    authSchemes: Array.isArray(toolkit.authSchemes)
      ? toolkit.authSchemes.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    composioManagedAuthSchemes: Array.isArray(
      toolkit.composioManagedAuthSchemes
    )
      ? toolkit.composioManagedAuthSchemes.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    noAuth: toolkit.noAuth === true,
  }
}

function normalizeConnection(
  account: Record<string, unknown>
): ConnectionSummary {
  const toolkit =
    account.toolkit && typeof account.toolkit === 'object'
      ? (account.toolkit as Record<string, unknown>)
      : {}
  const authConfig =
    account.authConfig && typeof account.authConfig === 'object'
      ? (account.authConfig as Record<string, unknown>)
      : account.auth_config && typeof account.auth_config === 'object'
        ? (account.auth_config as Record<string, unknown>)
        : {}

  return {
    id: typeof account.id === 'string' ? account.id : crypto.randomUUID(),
    authConfigId:
      typeof authConfig.id === 'string'
        ? authConfig.id
        : typeof account.authConfigId === 'string'
          ? (account.authConfigId as string)
          : null,
    status: typeof account.status === 'string' ? account.status : 'UNKNOWN',
    userId:
      typeof account.userId === 'string'
        ? (account.userId as string)
        : typeof account.user_id === 'string'
          ? (account.user_id as string)
          : null,
    toolkitSlug:
      typeof toolkit.slug === 'string'
        ? toolkit.slug
        : typeof account.toolkitSlug === 'string'
          ? (account.toolkitSlug as string)
          : 'unknown',
    toolkitName: getToolkitName(account),
    externalUserEmail: getExternalEmail(account),
    externalUserId: getExternalUserId(account),
    connectedAccountLabel: getExternalLabel(account),
    scopes: getScopes(account),
    metadata: account,
  }
}

function getSupportTier(toolkitSlug: string) {
  if (TIER_ONE_TOOLKITS.has(toolkitSlug)) return 'tier_1'
  if (TIER_TWO_TOOLKITS.has(toolkitSlug)) return 'tier_2'
  return 'tier_3'
}

function getConfiguredAuthConfigId(toolkitSlug: string) {
  switch (toolkitSlug) {
    case 'gmail':
    case 'googlecalendar':
      return env.COMPOSIO_AUTH_CONFIG_GOOGLE ?? null
    case 'slack':
      return env.COMPOSIO_AUTH_CONFIG_SLACK ?? null
    case 'github':
      return env.COMPOSIO_AUTH_CONFIG_GITHUB ?? null
    case 'linear':
      return env.COMPOSIO_AUTH_CONFIG_LINEAR ?? null
    case 'notion':
      return env.COMPOSIO_AUTH_CONFIG_NOTION ?? null
    default:
      return null
  }
}

export function getToolAccessSetupStatus() {
  const missing: string[] = []
  if (!env.COMPOSIO_API_KEY) missing.push('COMPOSIO_API_KEY')

  return {
    configured: missing.length === 0,
    apiConfigured: Boolean(env.COMPOSIO_API_KEY),
    webhookConfigured: Boolean(env.COMPOSIO_WEBHOOK_SECRET),
    callbackConfigured: Boolean(
      env.COMPOSIO_AUTH_CALLBACK_URL ||
      env.COMPOSIO_OAUTH_REDIRECT_URL ||
      env.APP_URL ||
      env.BETTER_AUTH_URL
    ),
    missing,
  }
}

export async function listToolkits(search?: string, limit = 60) {
  const composio = getComposioClient()
  const query = search?.trim().toLowerCase()
  const response = (await composio.toolkits.get({
    managedBy: 'all',
    sortBy: query ? 'alphabetically' : 'usage',
  })) as Array<Record<string, unknown>>

  const normalized = response.map((item) => normalizeToolkit(item))
  const filtered = query
    ? normalized.filter((toolkit) => {
        const haystack = [
          toolkit.slug,
          toolkit.name,
          toolkit.description ?? '',
          ...toolkit.categories.map((category) => category.name),
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(query)
      })
    : normalized

  return filtered.slice(0, limit)
}

export async function getToolkit(toolkitSlug: string) {
  const composio = getComposioClient()
  const toolkit = await composio.toolkits.get(toolkitSlug)
  return normalizeToolkit(toolkit as Record<string, unknown>)
}

export async function listConnectedAccounts(
  userId: string,
  toolkitSlugs?: string[]
) {
  const composio = getComposioClient()
  const response = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs,
    limit: 100,
  })

  return response.items.map((item) =>
    normalizeConnection(item as Record<string, unknown>)
  )
}

function buildToolkitConnectionValues(
  orgId: string,
  userId: string,
  account: ConnectionSummary
) {
  return {
    orgId,
    userId,
    toolkitSlug: account.toolkitSlug,
    toolkitName: account.toolkitName,
    authConfigId: account.authConfigId,
    authConfigSource: account.authConfigId
      ? getConfiguredAuthConfigId(account.toolkitSlug)
        ? 'custom'
        : 'managed'
      : null,
    connectedAccountId: account.id,
    connectedAccountStatus: account.status,
    connectedAccountLabel: account.connectedAccountLabel,
    externalUserId: account.externalUserId,
    externalUserEmail: account.externalUserEmail,
    scopes: account.scopes,
    metadata: account.metadata,
    lastValidatedAt: new Date(),
    lastErrorAt: ACCOUNT_ATTENTION_STATUSES.has(account.status)
      ? new Date()
      : null,
    errorMessage: getConnectionErrorMessage(account.status),
  }
}

async function ensureToolkitPolicyRow(
  dbInstance: AnyDb,
  orgId: string,
  userId: string,
  toolkitSlug: string
) {
  const existing = await dbInstance.query.toolkitPolicies.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, orgId), eq(fields.toolkitSlug, toolkitSlug)),
  })

  if (existing) return existing

  const [created] = await dbInstance
    .insert(toolkitPolicies)
    .values({
      orgId,
      toolkitSlug,
      createdByUserId: userId,
      updatedByUserId: userId,
      metadata: {
        seededBy: 'phase-1-composio-foundation',
      },
    })
    .returning()

  return created
}

export async function listToolkitPolicies(dbInstance: AnyDb, orgId: string) {
  return dbInstance.query.toolkitPolicies.findMany({
    where: (fields, { eq }) => eq(fields.orgId, orgId),
  })
}

export async function listToolkitAccountPreferences(
  dbInstance: AnyDb,
  orgId: string,
  userId: string
) {
  return dbInstance.query.toolkitAccountPreferences.findMany({
    where: (fields, operators) =>
      operators.and(
        operators.eq(fields.orgId, orgId),
        operators.eq(fields.userId, userId)
      ),
  })
}

export async function upsertToolkitAccountPreference(
  dbInstance: AnyDb,
  params: {
    orgId: string
    userId: string
    toolkitSlug: string
    preferredConnectedAccountId: string
  }
) {
  const [saved] = await dbInstance
    .insert(toolkitAccountPreferences)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      toolkitSlug: params.toolkitSlug,
      preferredConnectedAccountId: params.preferredConnectedAccountId,
    })
    .onConflictDoUpdate({
      target: [
        toolkitAccountPreferences.orgId,
        toolkitAccountPreferences.userId,
        toolkitAccountPreferences.toolkitSlug,
      ],
      set: {
        preferredConnectedAccountId: params.preferredConnectedAccountId,
        updatedAt: new Date(),
      },
    })
    .returning()

  return saved ?? null
}

export async function clearToolkitAccountPreference(
  dbInstance: AnyDb,
  params: {
    orgId: string
    userId: string
    toolkitSlug: string
  }
) {
  const existing = await dbInstance.query.toolkitAccountPreferences.findFirst({
    where: (fields, operators) =>
      operators.and(
        operators.eq(fields.orgId, params.orgId),
        operators.eq(fields.userId, params.userId),
        operators.eq(fields.toolkitSlug, params.toolkitSlug)
      ),
  })

  if (!existing) {
    return null
  }

  const [deleted] = await dbInstance
    .delete(toolkitAccountPreferences)
    .where(
      eq(toolkitAccountPreferences.id as never, existing.id as never) as never
    )
    .returning()

  return deleted ?? null
}

export async function syncConnectedAccounts(
  dbInstance: AnyDb,
  orgId: string,
  userId: string,
  accounts: ConnectionSummary[],
  toolkitSlugs?: string[]
) {
  const existingConnections =
    await dbInstance.query.toolkitConnections.findMany({
      where: (fields, operators) => {
        const clauses = [
          operators.eq(fields.orgId, orgId),
          operators.eq(fields.userId, userId),
        ]

        if ((toolkitSlugs?.length ?? 0) > 0) {
          clauses.push(
            operators.or(
              ...toolkitSlugs!.map((toolkitSlug) =>
                operators.eq(fields.toolkitSlug, toolkitSlug)
              )
            )!
          )
        }

        return operators.and(...clauses)
      },
    })

  const persisted: ToolkitConnection[] = []
  const remoteAccountIds = new Set(accounts.map((account) => account.id))

  for (const account of accounts) {
    await ensureToolkitPolicyRow(dbInstance, orgId, userId, account.toolkitSlug)
    const [saved] = await dbInstance
      .insert(toolkitConnections)
      .values(buildToolkitConnectionValues(orgId, userId, account))
      .onConflictDoUpdate({
        target: [
          toolkitConnections.orgId,
          toolkitConnections.userId,
          toolkitConnections.connectedAccountId,
        ],
        set: buildToolkitConnectionValues(orgId, userId, account),
      })
      .returning()

    if (!saved) {
      throw new Error(
        `Failed to persist Composio connection ${account.id} for ${account.toolkitSlug}.`
      )
    }

    persisted.push(saved)
  }

  const staleConnections = existingConnections.filter(
    (connection) => !remoteAccountIds.has(connection.connectedAccountId)
  )

  for (const staleConnection of staleConnections) {
    const updated = await markPersistedConnectionInactive(
      dbInstance,
      staleConnection.id
    )

    if (updated) {
      persisted.push(updated)
    }
  }

  const preferences = await listToolkitAccountPreferences(
    dbInstance,
    orgId,
    userId
  )

  for (const preference of preferences) {
    if (
      (toolkitSlugs?.length ?? 0) > 0 &&
      !toolkitSlugs?.includes(preference.toolkitSlug)
    ) {
      continue
    }

    const connectionsForToolkit = [
      ...existingConnections.filter(
        (connection) => connection.toolkitSlug === preference.toolkitSlug
      ),
      ...persisted.filter(
        (connection) => connection.toolkitSlug === preference.toolkitSlug
      ),
    ]

    const activePreferredExists = connectionsForToolkit.some(
      (connection) =>
        connection.connectedAccountId ===
          preference.preferredConnectedAccountId &&
        connection.connectedAccountStatus === 'ACTIVE'
    )

    if (!activePreferredExists) {
      await clearToolkitAccountPreference(dbInstance, {
        orgId,
        userId,
        toolkitSlug: preference.toolkitSlug,
      })
    }
  }

  return persisted
}

export async function syncUserConnectionsForOrg(
  dbInstance: AnyDb,
  orgId: string,
  userId: string,
  toolkitSlugs?: string[]
) {
  const accounts = await listConnectedAccounts(userId, toolkitSlugs)
  return syncConnectedAccounts(
    dbInstance,
    orgId,
    userId,
    accounts,
    toolkitSlugs
  )
}

export async function listPersistedConnections(
  dbInstance: AnyDb,
  orgId: string,
  userId: string
) {
  return dbInstance.query.toolkitConnections.findMany({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, orgId), eq(fields.userId, userId)),
    orderBy: (fields, { desc }) => [desc(fields.updatedAt)],
  })
}

export function choosePrimaryConnection(
  connections: ToolkitConnection[],
  preferredConnectedAccountId?: string | null
): ToolkitConnection | null {
  if (connections.length === 0) return null

  if (preferredConnectedAccountId) {
    const preferred = connections.find(
      (connection) =>
        connection.connectedAccountId === preferredConnectedAccountId &&
        connection.connectedAccountStatus === 'ACTIVE'
    )

    if (preferred) return preferred
  }

  return (
    connections.find(
      (connection) => connection.connectedAccountStatus === 'ACTIVE'
    ) ??
    connections.find(
      (connection) =>
        connection.connectedAccountId === preferredConnectedAccountId
    ) ??
    connections[0] ??
    null
  )
}

async function ensureAuthConfigId(toolkit: ToolkitSummary) {
  const configuredAuthConfigId = getConfiguredAuthConfigId(toolkit.slug)
  if (configuredAuthConfigId) {
    return { authConfigId: configuredAuthConfigId, source: 'custom' as const }
  }

  if (CUSTOM_AUTH_TOOLKITS.has(toolkit.slug)) {
    throw new Error(
      `${toolkit.name} requires a configured Composio auth config in this environment.`
    )
  }

  if (toolkit.noAuth) {
    throw new Error(`${toolkit.name} does not require a connected account.`)
  }

  const composio = getComposioClient()
  const existing = await composio.authConfigs.list({
    toolkit: toolkit.slug,
    isComposioManaged: true,
    limit: 20,
  })

  const existingEnabled = existing.items.find(
    (item) => item.status === 'ENABLED'
  )
  if (existingEnabled) {
    return { authConfigId: existingEnabled.id, source: 'managed' as const }
  }

  if ((toolkit.composioManagedAuthSchemes?.length ?? 0) === 0) {
    throw new Error(
      `${toolkit.name} does not have Composio-managed auth available and needs a custom auth config before it can be connected.`
    )
  }

  const created = await composio.authConfigs.create(toolkit.slug, {
    type: AuthConfigTypes.COMPOSIO_MANAGED,
    name: `Kodi ${toolkit.name}`,
    isEnabledForToolRouter: false,
  })

  return { authConfigId: created.id, source: 'managed' as const }
}

function resolveCallbackUrl(returnPath?: string) {
  const path = returnPath?.startsWith('/') ? returnPath : '/integrations'

  if (env.COMPOSIO_AUTH_CALLBACK_URL) {
    const url = new URL(env.COMPOSIO_AUTH_CALLBACK_URL)
    url.searchParams.set('returnPath', path)
    return url.toString()
  }

  if (env.COMPOSIO_OAUTH_REDIRECT_URL) {
    const url = new URL(env.COMPOSIO_OAUTH_REDIRECT_URL)
    url.searchParams.set('returnPath', path)
    return url.toString()
  }

  const baseUrl = env.APP_URL ?? env.BETTER_AUTH_URL
  if (!baseUrl) {
    throw new Error(
      'APP_URL or BETTER_AUTH_URL is required to build the Composio callback URL.'
    )
  }

  return new URL(path, baseUrl).toString()
}

export async function createConnectLink(params: {
  userId: string
  toolkitSlug: string
  returnPath?: string
}) {
  const toolkit = await getToolkit(params.toolkitSlug)
  const { authConfigId, source } = await ensureAuthConfigId(toolkit)
  const composio = getComposioClient()

  const connectionRequest = await composio.connectedAccounts.link(
    params.userId,
    authConfigId,
    {
      callbackUrl: resolveCallbackUrl(params.returnPath),
    }
  )

  return {
    toolkit,
    authConfigId,
    authConfigSource: source,
    connectedAccountId: connectionRequest.id,
    redirectUrl: connectionRequest.redirectUrl,
  }
}

export async function disableConnectedAccount(connectedAccountId: string) {
  const composio = getComposioClient()
  try {
    await composio.connectedAccounts.disable(connectedAccountId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('ConnectedAccount_ResourceNotFound') ||
      message.includes('Connected account not found')
    ) {
      return
    }

    throw error
  }
}

export async function markPersistedConnectionInactive(
  dbInstance: AnyDb,
  id: string
) {
  const [updated] = await dbInstance
    .update(toolkitConnections)
    .set({
      connectedAccountStatus: 'INACTIVE',
      errorMessage: null,
      lastErrorAt: null,
      lastValidatedAt: new Date(),
    })
    .where(eq(toolkitConnections.id as never, id as never) as never)
    .returning()

  return updated ?? null
}

export async function markPersistedConnectionAttention(
  dbInstance: AnyDb,
  id: string,
  params: {
    status?: string | null
    errorMessage?: string | null
  }
) {
  const [updated] = await dbInstance
    .update(toolkitConnections)
    .set({
      connectedAccountStatus: params.status ?? 'FAILED',
      errorMessage:
        params.errorMessage ??
        getConnectionErrorMessage(params.status ?? 'FAILED') ??
        'Connection requires attention in Composio.',
      lastErrorAt: new Date(),
      lastValidatedAt: new Date(),
    })
    .where(eq(toolkitConnections.id as never, id as never) as never)
    .returning()

  return updated ?? null
}

export async function revalidatePersistedConnection(
  dbInstance: AnyDb,
  connection: ToolkitConnection
) {
  const accounts = await listConnectedAccounts(connection.userId, [
    connection.toolkitSlug,
  ])
  const matchingAccount = accounts.find(
    (account) => account.id === connection.connectedAccountId
  )

  if (!matchingAccount) {
    return markPersistedConnectionInactive(dbInstance, connection.id)
  }

  const persisted = await syncConnectedAccounts(
    dbInstance,
    connection.orgId,
    connection.userId,
    [matchingAccount],
    [connection.toolkitSlug]
  )

  return (
    persisted.find(
      (item) => item.connectedAccountId === connection.connectedAccountId
    ) ?? null
  )
}

export async function revalidatePersistedConnectionsBatch(params: {
  db: AnyDb
  orgId?: string
  userId?: string
  toolkitSlug?: string
  limit?: number
  staleBefore?: Date | null
  forceAll?: boolean
}) {
  const candidates = await params.db.query.toolkitConnections.findMany({
    where: (fields, operators) => {
      const clauses = [operators.ne(fields.connectedAccountStatus, 'INACTIVE')]

      if (params.orgId) {
        clauses.push(operators.eq(fields.orgId, params.orgId))
      }

      if (params.userId) {
        clauses.push(operators.eq(fields.userId, params.userId))
      }

      if (params.toolkitSlug) {
        clauses.push(operators.eq(fields.toolkitSlug, params.toolkitSlug))
      }

      if (!params.forceAll) {
        const staleClauses = [
          operators.eq(fields.connectedAccountStatus, 'FAILED'),
          operators.eq(fields.connectedAccountStatus, 'EXPIRED'),
          operators.eq(fields.connectedAccountStatus, 'INITIATED'),
          operators.isNull(fields.lastValidatedAt),
        ]

        if (params.staleBefore) {
          staleClauses.push(
            operators.lt(fields.lastValidatedAt, params.staleBefore)
          )
        }

        clauses.push(operators.or(...staleClauses)!)
      }

      return operators.and(...clauses)
    },
    orderBy: (fields, operators) => [
      operators.asc(fields.lastValidatedAt),
      operators.desc(fields.updatedAt),
    ],
    limit: params.limit ?? 100,
  })

  const results: Array<{
    id: string
    orgId: string
    userId: string
    toolkitSlug: string
    connectedAccountId: string
    previousStatus: string
    nextStatus: string
    changed: boolean
    error: string | null
  }> = []

  for (const connection of candidates) {
    try {
      const refreshed = await revalidatePersistedConnection(
        params.db,
        connection
      )
      const nextStatus = refreshed?.connectedAccountStatus ?? 'INACTIVE'
      results.push({
        id: connection.id,
        orgId: connection.orgId,
        userId: connection.userId,
        toolkitSlug: connection.toolkitSlug,
        connectedAccountId: connection.connectedAccountId,
        previousStatus: connection.connectedAccountStatus ?? 'UNKNOWN',
        nextStatus,
        changed:
          (connection.connectedAccountStatus ?? 'UNKNOWN') !== nextStatus,
        error: null,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to revalidate the connected account.'

      await markPersistedConnectionAttention(params.db, connection.id, {
        status: 'FAILED',
        errorMessage: message,
      })

      results.push({
        id: connection.id,
        orgId: connection.orgId,
        userId: connection.userId,
        toolkitSlug: connection.toolkitSlug,
        connectedAccountId: connection.connectedAccountId,
        previousStatus: connection.connectedAccountStatus ?? 'UNKNOWN',
        nextStatus: 'FAILED',
        changed: (connection.connectedAccountStatus ?? 'UNKNOWN') !== 'FAILED',
        error: message,
      })
    }
  }

  return {
    scannedCount: candidates.length,
    changedCount: results.filter((item) => item.changed).length,
    failureCount: results.filter((item) => item.error).length,
    results,
  }
}

export async function syncWebhookConnectionUpdate(
  dbInstance: AnyDb,
  rawConnection: Record<string, unknown>
) {
  const account = normalizeConnection(rawConnection)
  const existingAssociations =
    await dbInstance.query.toolkitConnections.findMany({
      where: (fields, { eq }) => eq(fields.connectedAccountId, account.id),
    })

  if (existingAssociations.length === 0) {
    return []
  }

  const updated: ToolkitConnection[] = []

  for (const association of existingAssociations) {
    await ensureToolkitPolicyRow(
      dbInstance,
      association.orgId,
      association.userId,
      account.toolkitSlug
    )

    const [saved] = await dbInstance
      .update(toolkitConnections)
      .set(
        buildToolkitConnectionValues(
          association.orgId,
          association.userId,
          account
        )
      )
      .where(
        eq(toolkitConnections.id as never, association.id as never) as never
      )
      .returning()

    if (!saved) {
      throw new Error(
        `Failed to sync webhook update for connected account ${account.id}.`
      )
    }

    updated.push(saved)
  }

  return updated
}

export function getToolAccessPresentation(toolkit: ToolkitSummary) {
  const configuredAuthConfigId = getConfiguredAuthConfigId(toolkit.slug)
  const supportTier = getSupportTier(toolkit.slug)

  const requiresCustomAuth = CUSTOM_AUTH_TOOLKITS.has(toolkit.slug)
  const canUseManagedAuth =
    (toolkit.composioManagedAuthSchemes?.length ?? 0) > 0 && !toolkit.noAuth

  return {
    supportTier,
    authMode: requiresCustomAuth
      ? 'custom'
      : canUseManagedAuth
        ? 'managed'
        : toolkit.noAuth
          ? 'no_auth'
          : 'unknown',
    canConnect:
      toolkit.noAuth ||
      Boolean(configuredAuthConfigId) ||
      (!requiresCustomAuth && canUseManagedAuth),
    configuredAuthConfigId,
  }
}
