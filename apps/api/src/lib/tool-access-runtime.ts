import { eq } from 'drizzle-orm'
import { db, toolActionRuns, toolSessionRuns } from '@kodi/db'
import { env } from '../env'
import {
  choosePrimaryConnection,
  getComposioClient,
  getEffectiveToolkitPolicy,
  getToolAccessSetupStatus,
  listPersistedConnections,
  listToolkitAccountPreferences,
  listToolkitPolicies,
  syncUserConnectionsForOrg,
  type EffectiveToolkitPolicy,
} from './composio'

type AnyDb = typeof db

const ACTIVE_CONNECTION_STATUS = 'ACTIVE'
const MAX_RELEVANT_TOOLS = 12
const MAX_TOOL_ROUNDS = 6
const MAX_TOOL_CALLS_PER_ROUND = 4
const OPENCLAW_REQUEST_TIMEOUT_MS = 60_000

const READ_VERBS = new Set([
  'GET',
  'LIST',
  'FIND',
  'SEARCH',
  'FETCH',
  'READ',
  'RETRIEVE',
  'QUERY',
  'LOOKUP',
  'DESCRIBE',
  'VIEW',
  'CHECK',
  'COUNT',
  'INSPECT',
])

const DRAFT_VERBS = new Set([
  'DRAFT',
  'PREVIEW',
  'PREPARE',
  'SUGGEST',
  'PLAN',
  'OUTLINE',
  'SUMMARIZE',
])

const WRITE_VERBS = new Set([
  'CREATE',
  'UPDATE',
  'UPSERT',
  'DELETE',
  'SEND',
  'POST',
  'WRITE',
  'EDIT',
  'REMOVE',
  'ADD',
  'REPLY',
  'COMMENT',
  'MERGE',
  'APPROVE',
  'REJECT',
  'ASSIGN',
  'MOVE',
  'ARCHIVE',
  'UNARCHIVE',
  'CLOSE',
  'OPEN',
  'COMPLETE',
  'CANCEL',
  'PUBLISH',
  'SHARE',
  'TAG',
  'UNTAG',
  'STAR',
  'UNSTAR',
  'SYNC',
  'RUN',
  'EXECUTE',
  'TRIGGER',
  'UPLOAD',
  'IMPORT',
  'EXPORT',
])

const ADMIN_KEYWORDS = [
  'ADMIN',
  'SCIM',
  'PERMISSION',
  'ROLE',
  'WORKSPACE',
  'ORGANIZATION',
  'TEAM',
  'MEMBER',
  'INSTALL',
  'UNINSTALL',
  'WEBHOOK',
  'TOKEN',
  'SECRET',
  'AUTH_CONFIG',
  'INTEGRATION',
]

export type ToolRuntimeSourceType = 'chat' | 'meeting'

export type ToolActionCategory = 'read' | 'draft' | 'write' | 'admin'

export type ToolPermissionStatus = 'allowed' | 'approval_required' | 'denied'

type LegacyToolProvider =
  | 'linear'
  | 'github'
  | 'slack'
  | 'jira'
  | 'notion'
  | 'zoom'

type OpenAIToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type OpenAIMessage =
  | {
      role: 'system' | 'user' | 'assistant'
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
  | {
      role: 'tool'
      content: string
      tool_call_id: string
    }

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type ChatCompletionChoice = {
  finish_reason?: string | null
  message?: {
    role?: string
    content?: string | null
    tool_calls?: Array<{
      id?: string
      type?: string
      function?: {
        name?: string
        arguments?: string
      }
    }>
  }
}

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[]
}

type RuntimeConnection = Awaited<
  ReturnType<typeof listPersistedConnections>
>[number]

type RuntimePolicy = Awaited<ReturnType<typeof listToolkitPolicies>>[number]

type RuntimePreference = Awaited<
  ReturnType<typeof listToolkitAccountPreferences>
>[number]

type SessionTool = {
  slug: string
  name: string
  description: string
  inputParameters: Record<string, unknown>
  outputParameters: Record<string, unknown>
  scopes: string[]
  tags: string[]
  toolkit: {
    slug: string
    name: string
    logo: string | null
  }
}

type ToolPermissionDecision = {
  toolSlug: string
  toolkitSlug: string
  toolkitName: string
  category: ToolActionCategory
  status: ToolPermissionStatus
  reason: string
  policy: EffectiveToolkitPolicy
  connectedAccountId: string | null
  connectionId: string | null
}

type ScopedToolRuntime = {
  sessionRunId: string | null
  composioSessionId: string | null
  enabledToolkits: string[]
  allowedTools: SessionTool[]
  openAITools: OpenAIToolDefinition[]
  allowedDecisions: Map<string, ToolPermissionDecision>
  gatedDecisions: ToolPermissionDecision[]
  assistivePrompt: string | null
  metadata: Record<string, unknown>
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function matchesPolicyPattern(
  patterns: string[],
  toolkitSlug: string,
  toolSlug: string,
  category: ToolActionCategory
) {
  if (patterns.length === 0) return true

  const candidates = [
    toolSlug.toLowerCase(),
    `${toolkitSlug}:${toolSlug}`.toLowerCase(),
    `${toolkitSlug}:${category}`.toLowerCase(),
    `${toolkitSlug}:*`.toLowerCase(),
  ]

  return patterns.some((pattern) => {
    const regex = new RegExp(
      `^${escapeRegex(pattern.toLowerCase()).replace(/\\\*/g, '.*')}$`
    )
    return candidates.some((candidate) => regex.test(candidate))
  })
}

function normalizeSessionTool(
  raw: Record<string, unknown>
): SessionTool | null {
  const toolkit =
    raw.toolkit && typeof raw.toolkit === 'object'
      ? (raw.toolkit as Record<string, unknown>)
      : {}

  const slug = typeof raw.slug === 'string' ? raw.slug : null
  const name = typeof raw.name === 'string' ? raw.name : null
  const description =
    typeof raw.human_description === 'string'
      ? raw.human_description
      : typeof raw.description === 'string'
        ? raw.description
        : null

  if (!slug || !name || !description) {
    return null
  }

  return {
    slug,
    name,
    description,
    inputParameters:
      raw.input_parameters && typeof raw.input_parameters === 'object'
        ? (raw.input_parameters as Record<string, unknown>)
        : { type: 'object', properties: {} },
    outputParameters:
      raw.output_parameters && typeof raw.output_parameters === 'object'
        ? (raw.output_parameters as Record<string, unknown>)
        : {},
    scopes: Array.isArray(raw.scopes)
      ? raw.scopes.filter((item): item is string => typeof item === 'string')
      : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((item): item is string => typeof item === 'string')
      : [],
    toolkit: {
      slug: typeof toolkit.slug === 'string' ? toolkit.slug : 'unknown',
      name: typeof toolkit.name === 'string' ? toolkit.name : 'Unknown toolkit',
      logo: typeof toolkit.logo === 'string' ? toolkit.logo : null,
    },
  }
}

function normalizeToolParameters(schema: Record<string, unknown>) {
  if (schema.type === 'object') {
    return schema
  }

  return {
    type: 'object',
    properties: schema.properties ?? {},
    required: schema.required ?? [],
    additionalProperties:
      typeof schema.additionalProperties === 'boolean'
        ? schema.additionalProperties
        : true,
  }
}

function getToolCategory(tool: SessionTool): ToolActionCategory {
  const tagSet = new Set(tool.tags.map((tag) => tag.toLowerCase()))
  const slugTokens = tool.slug
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
  const signature = [tool.slug, tool.name, tool.description]
    .join(' ')
    .toUpperCase()

  if (
    ADMIN_KEYWORDS.some((keyword) => signature.includes(keyword)) ||
    signature.includes('DELETE_USER') ||
    signature.includes('MANAGE_')
  ) {
    return 'admin'
  }

  if (
    signature.includes('DRAFT') ||
    slugTokens.some((token) => DRAFT_VERBS.has(token))
  ) {
    return 'draft'
  }

  if (tagSet.has('readonlyhint')) {
    return 'read'
  }

  if (slugTokens.some((token) => READ_VERBS.has(token))) {
    return 'read'
  }

  if (
    tagSet.has('destructivehint') ||
    slugTokens.some((token) => WRITE_VERBS.has(token))
  ) {
    return 'write'
  }

  return 'read'
}

function resolveChatAccessAllowed(
  policy: EffectiveToolkitPolicy,
  category: ToolActionCategory,
  sourceType: ToolRuntimeSourceType
): { status: ToolPermissionStatus; reason: string } {
  if (!policy.enabled) {
    return {
      status: 'denied',
      reason: 'Workspace policy disabled this toolkit.',
    }
  }

  if (category === 'read') {
    const readsEnabled =
      sourceType === 'meeting'
        ? policy.meetingReadsEnabled
        : policy.chatReadsEnabled

    return readsEnabled
      ? { status: 'allowed', reason: 'Reads are enabled by workspace policy.' }
      : {
          status: 'denied',
          reason:
            sourceType === 'meeting'
              ? 'Meeting reads are disabled by workspace policy.'
              : 'Chat reads are disabled by workspace policy.',
        }
  }

  if (category === 'draft') {
    return policy.draftsEnabled
      ? { status: 'allowed', reason: 'Draft actions are enabled.' }
      : {
          status: 'denied',
          reason: 'Draft actions are disabled by workspace policy.',
        }
  }

  if (category === 'admin') {
    if (!policy.adminActionsEnabled) {
      return {
        status: 'denied',
        reason: 'Administrative actions are disabled by workspace policy.',
      }
    }

    return policy.writesRequireApproval
      ? {
          status: 'approval_required',
          reason: 'Administrative actions require approval before execution.',
        }
      : {
          status: 'allowed',
          reason: 'Administrative actions are enabled without approval.',
        }
  }

  return policy.writesRequireApproval
    ? {
        status: 'approval_required',
        reason: 'Write actions require approval before execution.',
      }
    : {
        status: 'allowed',
        reason: 'Write actions are enabled without approval.',
      }
}

function buildRuntimeSystemPrompt(runtime: ScopedToolRuntime) {
  const lines = [
    'Tool access for this response is temporary and request-scoped. Only use tools that are exposed in this request.',
  ]

  if (runtime.assistivePrompt) {
    lines.push(runtime.assistivePrompt.trim())
  }

  if (runtime.enabledToolkits.length > 0) {
    lines.push(
      `Connected toolkits in scope for this request: ${runtime.enabledToolkits.join(', ')}.`
    )
  }

  if (runtime.allowedTools.length > 0) {
    lines.push(
      `Executable tools surfaced for this request: ${runtime.allowedTools
        .map((tool) => tool.slug)
        .slice(0, MAX_RELEVANT_TOOLS)
        .join(', ')}.`
    )
  }

  const approvalRequired = runtime.gatedDecisions.filter(
    (decision) => decision.status === 'approval_required'
  )
  if (approvalRequired.length > 0) {
    lines.push(
      `Matching actions that require approval and are not executable right now: ${approvalRequired
        .map((decision) => decision.toolSlug)
        .slice(0, MAX_RELEVANT_TOOLS)
        .join(', ')}.`
    )
  }

  const denied = runtime.gatedDecisions.filter(
    (decision) => decision.status === 'denied'
  )
  if (denied.length > 0) {
    lines.push(
      `Matching actions blocked by workspace policy or connection state: ${denied
        .map((decision) => `${decision.toolSlug} (${decision.reason})`)
        .slice(0, 6)
        .join('; ')}.`
    )
  }

  lines.push(
    'If the user asks for a gated action, explain the constraint clearly and offer a draft or guidance instead of claiming the action was completed.'
  )

  return lines.join('\n')
}

function toOpenAITool(tool: SessionTool): OpenAIToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.slug,
      description: tool.description,
      parameters: normalizeToolParameters(tool.inputParameters),
    },
  }
}

function toLegacyToolProvider(toolkitSlug: string): LegacyToolProvider | null {
  switch (toolkitSlug) {
    case 'linear':
    case 'github':
    case 'slack':
    case 'jira':
    case 'notion':
    case 'zoom':
      return toolkitSlug
    default:
      return null
  }
}

function parseToolCallArguments(toolCall: OpenAIToolCall) {
  try {
    const parsed = JSON.parse(toolCall.function.arguments)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true as const, value: parsed as Record<string, unknown> }
    }

    return {
      ok: false as const,
      error: 'Tool arguments must be a JSON object.',
    }
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Tool arguments were not valid JSON.',
    }
  }
}

async function requestOpenClawChatCompletion(params: {
  instanceUrl: string
  headers: Record<string, string>
  messages: OpenAIMessage[]
  tools?: OpenAIToolDefinition[]
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENCLAW_REQUEST_TIMEOUT_MS
  )

  try {
    const body: Record<string, unknown> = {
      model: 'openclaw:main',
      messages: params.messages,
    }

    if ((params.tools?.length ?? 0) > 0) {
      body.tools = params.tools
      body.tool_choice = 'auto'
    }

    const response = await fetch(`${params.instanceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: params.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      throw new Error(
        `Instance responded with HTTP ${response.status}: ${bodyText}`
      )
    }

    const data = (await response.json()) as ChatCompletionResponse
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loadRuntimeState(params: {
  db: AnyDb
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

  const [connections, policies, preferences] = await Promise.all([
    listPersistedConnections(params.db, params.orgId, params.userId),
    listToolkitPolicies(params.db, params.orgId),
    listToolkitAccountPreferences(params.db, params.orgId, params.userId),
  ])

  return {
    setup,
    syncError,
    connections,
    policies,
    preferences,
  }
}

function buildActiveToolkitState(params: {
  connections: RuntimeConnection[]
  policies: RuntimePolicy[]
  preferences: RuntimePreference[]
}) {
  const connectionsByToolkit = new Map<string, RuntimeConnection[]>()
  const policiesByToolkit = new Map<string, RuntimePolicy>(
    params.policies.map((policy) => [policy.toolkitSlug, policy])
  )
  const preferencesByToolkit = new Map<string, RuntimePreference>(
    params.preferences.map((preference) => [preference.toolkitSlug, preference])
  )

  for (const connection of params.connections) {
    const existing = connectionsByToolkit.get(connection.toolkitSlug) ?? []
    existing.push(connection)
    connectionsByToolkit.set(connection.toolkitSlug, existing)
  }

  const enabledToolkits: string[] = []
  const connectedAccountOverrides: Record<string, string> = {}
  const authConfigOverrides: Record<string, string> = {}
  const primaryConnections = new Map<string, RuntimeConnection>()
  const policies = new Map<string, EffectiveToolkitPolicy>()

  for (const [toolkitSlug, toolkitConnectionsForSlug] of connectionsByToolkit) {
    const activeConnections = toolkitConnectionsForSlug.filter(
      (connection) =>
        connection.connectedAccountStatus === ACTIVE_CONNECTION_STATUS
    )
    if (activeConnections.length === 0) continue

    const preference = preferencesByToolkit.get(toolkitSlug) ?? null
    const primary = choosePrimaryConnection(
      activeConnections,
      preference?.preferredConnectedAccountId ?? null
    )
    if (!primary) continue

    const effectivePolicy = getEffectiveToolkitPolicy(
      policiesByToolkit.get(toolkitSlug) ?? null,
      toolkitSlug
    )

    if (!effectivePolicy.enabled) continue

    enabledToolkits.push(toolkitSlug)
    connectedAccountOverrides[toolkitSlug] = primary.connectedAccountId

    if (primary.authConfigId) {
      authConfigOverrides[toolkitSlug] = primary.authConfigId
    }

    primaryConnections.set(toolkitSlug, primary)
    policies.set(toolkitSlug, effectivePolicy)
  }

  return {
    enabledToolkits,
    connectedAccountOverrides,
    authConfigOverrides,
    primaryConnections,
    policies,
  }
}

function resolveChatManageConnectionsCallbackUrl() {
  if (!env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT) {
    return undefined
  }

  if (env.COMPOSIO_OAUTH_REDIRECT_URL) {
    const url = new URL(env.COMPOSIO_OAUTH_REDIRECT_URL)
    url.searchParams.set('returnPath', '/chat')
    return url.toString()
  }

  const baseUrl = env.APP_URL ?? env.BETTER_AUTH_URL
  if (!baseUrl) {
    return undefined
  }

  return new URL('/chat', baseUrl).toString()
}

async function createScopedToolRuntime(params: {
  db: AnyDb
  orgId: string
  userId: string
  sourceType: ToolRuntimeSourceType
  sourceId?: string | null
  userMessage: string
}) {
  if (!env.KODI_FEATURE_TOOL_ACCESS) {
    return null
  }

  const runtimeState = await loadRuntimeState({
    db: params.db,
    orgId: params.orgId,
    userId: params.userId,
  })

  if (!runtimeState.setup.apiConfigured) {
    return null
  }

  const activeToolkitState = buildActiveToolkitState(runtimeState)
  if (activeToolkitState.enabledToolkits.length === 0) {
    return null
  }

  const composio = getComposioClient()
  const session = await composio.create(params.userId, {
    toolkits: {
      enable: activeToolkitState.enabledToolkits,
    },
    connectedAccounts: activeToolkitState.connectedAccountOverrides,
    authConfigs:
      Object.keys(activeToolkitState.authConfigOverrides).length > 0
        ? activeToolkitState.authConfigOverrides
        : undefined,
    manageConnections: {
      enable: env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
      waitForConnections: false,
      callbackUrl: resolveChatManageConnectionsCallbackUrl(),
    },
    workbench: {
      enable: false,
      enableProxyExecution: false,
    },
    experimental: {
      assistivePrompt: {
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  })

  const [sessionRun] = await params.db
    .insert(toolSessionRuns)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      composioSessionId: session.sessionId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      enabledToolkits: activeToolkitState.enabledToolkits,
      connectedAccountOverrides: activeToolkitState.connectedAccountOverrides,
      manageConnectionsInChat: env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
      workbenchEnabled: false,
      metadata: {
        syncError: runtimeState.syncError,
        mcpUrl: session.mcp?.url ?? null,
      },
    })
    .returning()

  if (!sessionRun) {
    throw new Error('Failed to persist the scoped tool session run.')
  }

  let relevantToolSlugs: string[] = []
  let searchError: string | null = null
  let relevantTools: SessionTool[] = []

  try {
    const searchResponse = (await session.search({
      query: params.userMessage,
      toolkits: activeToolkitState.enabledToolkits,
    })) as {
      error?: string | null
      results?: Array<{
        error?: string | null
        primaryToolSlugs?: string[]
        relatedToolSlugs?: string[]
      }>
      toolSchemas?: Record<
        string,
        {
          toolSlug: string
          toolkit: string
          description?: string
          inputSchema?: Record<string, unknown>
          outputSchema?: Record<string, unknown>
        }
      >
    }

    const primaryResult = searchResponse.results?.[0]
    relevantToolSlugs = uniqueStrings([
      ...(primaryResult?.primaryToolSlugs ?? []),
      ...(primaryResult?.relatedToolSlugs ?? []),
    ]).slice(0, MAX_RELEVANT_TOOLS)

    searchError = primaryResult?.error ?? searchResponse.error ?? null

    relevantTools = relevantToolSlugs.reduce<SessionTool[]>((items, slug) => {
      const schema = searchResponse.toolSchemas?.[slug]
      if (!schema) return items

      const connection =
        activeToolkitState.primaryConnections.get(schema.toolkit) ?? null

      items.push({
        slug: schema.toolSlug,
        name: schema.toolSlug,
        description: schema.description ?? schema.toolSlug,
        inputParameters: schema.inputSchema ?? {
          type: 'object',
          properties: {},
        },
        outputParameters: schema.outputSchema ?? {},
        scopes: [] as string[],
        tags: [] as string[],
        toolkit: {
          slug: schema.toolkit,
          name: connection?.toolkitName ?? schema.toolkit,
          logo: null,
        },
      } satisfies SessionTool)

      return items
    }, [])
  } catch (error) {
    searchError =
      error instanceof Error
        ? error.message
        : 'Failed to search Composio tools.'
  }

  const decisions = relevantTools.map((tool) => {
    const policy =
      activeToolkitState.policies.get(tool.toolkit.slug) ??
      getEffectiveToolkitPolicy(null, tool.toolkit.slug)
    const primaryConnection =
      activeToolkitState.primaryConnections.get(tool.toolkit.slug) ?? null
    const category = getToolCategory(tool)

    if (!primaryConnection) {
      return {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit.slug,
        toolkitName: tool.toolkit.name,
        category,
        status: 'denied',
        reason: 'No active connected account is available for this toolkit.',
        policy,
        connectedAccountId: null,
        connectionId: null,
      } satisfies ToolPermissionDecision
    }

    if (
      !matchesPolicyPattern(
        policy.allowedActionPatterns ?? [],
        tool.toolkit.slug,
        tool.slug,
        category
      )
    ) {
      return {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit.slug,
        toolkitName: tool.toolkit.name,
        category,
        status: 'denied',
        reason: 'This action is not allowlisted by workspace policy.',
        policy,
        connectedAccountId: primaryConnection.connectedAccountId,
        connectionId: primaryConnection.id,
      } satisfies ToolPermissionDecision
    }

    const access = resolveChatAccessAllowed(policy, category, params.sourceType)

    return {
      toolSlug: tool.slug,
      toolkitSlug: tool.toolkit.slug,
      toolkitName: tool.toolkit.name,
      category,
      status: access.status,
      reason: access.reason,
      policy,
      connectedAccountId: primaryConnection.connectedAccountId,
      connectionId: primaryConnection.id,
    } satisfies ToolPermissionDecision
  })

  const allowedDecisions = new Map<string, ToolPermissionDecision>()
  const gatedDecisions: ToolPermissionDecision[] = []

  for (const decision of decisions) {
    if (decision.status === 'allowed') {
      allowedDecisions.set(decision.toolSlug, decision)
    } else {
      gatedDecisions.push(decision)
    }
  }

  const allowedTools = relevantTools.filter((tool) =>
    allowedDecisions.has(tool.slug)
  )

  const metadata: Record<string, unknown> = {
    syncError: runtimeState.syncError,
    searchError,
    relevantToolSlugs,
    allowedToolSlugs: allowedTools.map((tool) => tool.slug),
    gatedTools: gatedDecisions.map((decision) => ({
      toolSlug: decision.toolSlug,
      status: decision.status,
      reason: decision.reason,
    })),
    matchingToolCount: relevantTools.length,
    mcpUrl: session.mcp?.url ?? null,
  }

  await params.db
    .update(toolSessionRuns)
    .set({ metadata })
    .where(eq(toolSessionRuns.id, sessionRun.id))

  return {
    sessionRunId: sessionRun.id,
    composioSessionId: session.sessionId,
    enabledToolkits: activeToolkitState.enabledToolkits,
    allowedTools,
    openAITools: allowedTools.map((tool) => toOpenAITool(tool)),
    allowedDecisions,
    gatedDecisions,
    assistivePrompt: session.experimental?.assistivePrompt ?? null,
    metadata,
  } satisfies ScopedToolRuntime
}

async function recordToolActionRunStart(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sessionRunId: string
  decision: ToolPermissionDecision
  toolCallId: string
  argumentsPayload: Record<string, unknown> | null
}) {
  const [created] = await params.db
    .insert(toolActionRuns)
    .values({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      toolSessionRunId: params.sessionRunId,
      tool: toLegacyToolProvider(params.decision.toolkitSlug),
      toolkitSlug: params.decision.toolkitSlug,
      connectedAccountId: params.decision.connectedAccountId,
      action: params.decision.toolSlug,
      actionCategory: params.decision.category,
      idempotencyKey: `${params.sessionRunId}:${params.toolCallId}`,
      status: 'running',
      requestPayload: {
        toolCallId: params.toolCallId,
        arguments: params.argumentsPayload,
      },
      startedAt: new Date(),
    })
    .returning()

  return created!
}

async function finishToolActionRun(params: {
  db: AnyDb
  toolActionRunId: string
  status: 'succeeded' | 'failed'
  responsePayload?: Record<string, unknown> | null
  error?: string | null
}) {
  await params.db
    .update(toolActionRuns)
    .set({
      status: params.status,
      responsePayload: params.responsePayload ?? null,
      error: params.error ?? null,
      completedAt: new Date(),
    })
    .where(eq(toolActionRuns.id, params.toolActionRunId))
}

async function executeAllowedToolCall(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sessionRunId: string
  composioSessionId: string
  toolCall: OpenAIToolCall
  decision: ToolPermissionDecision
}) {
  const parsedArguments = parseToolCallArguments(params.toolCall)

  if (!parsedArguments.ok) {
    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify({
          success: false,
          error: parsedArguments.error,
        }),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
    }
  }

  const run = await recordToolActionRunStart({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    sessionRunId: params.sessionRunId,
    decision: params.decision,
    toolCallId: params.toolCall.id,
    argumentsPayload: parsedArguments.value,
  })

  try {
    const composio = getComposioClient()
    const session = await composio.toolRouter.use(params.composioSessionId)
    const response = (await session.execute(
      params.decision.toolSlug,
      parsedArguments.value
    )) as {
      data?: Record<string, unknown>
      error?: string | null
      logId?: string
    }

    const toolPayload = {
      success: !response.error,
      error: response.error ?? null,
      data: response.data ?? null,
      logId: response.logId ?? null,
    }

    await finishToolActionRun({
      db: params.db,
      toolActionRunId: run.id,
      status: response.error ? 'failed' : 'succeeded',
      responsePayload: toolPayload,
      error: response.error ?? null,
    })

    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify(toolPayload),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Tool execution failed.'

    await finishToolActionRun({
      db: params.db,
      toolActionRunId: run.id,
      status: 'failed',
      responsePayload: {
        success: false,
        error: message,
      },
      error: message,
    })

    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify({
          success: false,
          error: message,
        }),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
    }
  }
}

async function expireToolSessionRun(
  dbInstance: AnyDb,
  sessionRunId: string | null,
  metadata?: Record<string, unknown>
) {
  if (!sessionRunId) return

  await dbInstance
    .update(toolSessionRuns)
    .set({
      expiredAt: new Date(),
      ...(metadata ? { metadata } : {}),
    })
    .where(eq(toolSessionRuns.id, sessionRunId))
}

export async function runChatCompletionWithToolAccess(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sourceId?: string | null
  userMessage: string
  instanceUrl: string
  headers: Record<string, string>
  messages: Array<{ role: string; content: string }>
}) {
  const scopedRuntime = await createScopedToolRuntime({
    db: params.db,
    orgId: params.orgId,
    userId: params.actorUserId,
    sourceType: 'chat',
    sourceId: params.sourceId,
    userMessage: params.userMessage,
  })

  const baseMessages = params.messages.map((message) => ({
    role:
      message.role === 'system' || message.role === 'assistant'
        ? message.role
        : 'user',
    content: message.content,
  })) as OpenAIMessage[]

  const runtimePrompt = scopedRuntime
    ? buildRuntimeSystemPrompt(scopedRuntime)
    : null

  const requestMessages =
    runtimePrompt && baseMessages[0]?.role === 'system'
      ? [
          {
            role: 'system',
            content: `${baseMessages[0].content ?? ''}\n\n${runtimePrompt}`,
          } satisfies OpenAIMessage,
          ...baseMessages.slice(1),
        ]
      : baseMessages

  const conversation = [...requestMessages]
  const usedToolSlugs: string[] = []

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await requestOpenClawChatCompletion({
        instanceUrl: params.instanceUrl,
        headers: params.headers,
        messages: conversation,
        tools: scopedRuntime?.openAITools,
      })

      const choice = response.choices?.[0]
      const rawMessage = choice?.message

      if (!rawMessage) {
        throw new Error('Empty response from instance')
      }

      const toolCalls = (rawMessage.tool_calls ?? [])
        .map((toolCall) => {
          const id = typeof toolCall.id === 'string' ? toolCall.id : null
          const name =
            typeof toolCall.function?.name === 'string'
              ? toolCall.function.name
              : null
          const args =
            typeof toolCall.function?.arguments === 'string'
              ? toolCall.function.arguments
              : null

          if (!id || !name || !args) {
            return null
          }

          return {
            id,
            type: 'function',
            function: {
              name,
              arguments: args,
            },
          } satisfies OpenAIToolCall
        })
        .filter((toolCall): toolCall is OpenAIToolCall => toolCall !== null)

      if (toolCalls.length === 0) {
        const content = rawMessage.content?.trim()
        if (!content) {
          throw new Error('Empty response from instance')
        }

        return {
          content,
          toolRuntime: scopedRuntime
            ? {
                sessionRunId: scopedRuntime.sessionRunId,
                composioSessionId: scopedRuntime.composioSessionId,
                usedToolSlugs: uniqueStrings(usedToolSlugs),
                gatedToolCount: scopedRuntime.gatedDecisions.length,
                availableToolCount: scopedRuntime.allowedTools.length,
              }
            : null,
        }
      }

      conversation.push({
        role: 'assistant',
        content: rawMessage.content ?? null,
        tool_calls: toolCalls,
      })

      const toolMessages: OpenAIMessage[] = []

      for (const [index, toolCall] of toolCalls.entries()) {
        if (index >= MAX_TOOL_CALLS_PER_ROUND) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: `Kodi only executes up to ${MAX_TOOL_CALLS_PER_ROUND} tool calls in one round.`,
            }),
          })
          continue
        }

        const decision = scopedRuntime?.allowedDecisions.get(
          toolCall.function.name
        )
        const sessionRunId = scopedRuntime?.sessionRunId ?? null
        const composioSessionId = scopedRuntime?.composioSessionId ?? null

        if (!decision || !composioSessionId || !sessionRunId) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error:
                'This tool is not executable in the current request scope.',
            }),
          })
          continue
        }

        const result = await executeAllowedToolCall({
          db: params.db,
          orgId: params.orgId,
          actorUserId: params.actorUserId,
          sessionRunId,
          composioSessionId,
          toolCall,
          decision,
        })

        usedToolSlugs.push(result.toolSlug)
        toolMessages.push(result.toolMessage)
      }

      conversation.push(...toolMessages)
    }

    throw new Error(
      'Tool execution loop exceeded the maximum number of rounds.'
    )
  } finally {
    if (scopedRuntime?.sessionRunId) {
      await expireToolSessionRun(params.db, scopedRuntime.sessionRunId, {
        ...scopedRuntime.metadata,
        usedToolSlugs: uniqueStrings(usedToolSlugs),
      })
    }
  }
}
