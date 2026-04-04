import { eq } from 'drizzle-orm'
import {
  approvalRequests,
  db,
  toolActionRuns,
  toolkitConnections,
  toolSessionRuns,
} from '@kodi/db'
import {
  getComposioClient,
  getEffectiveToolkitPolicy,
  markPersistedConnectionAttention,
  revalidatePersistedConnection,
} from './composio'
import { logActivity } from './activity'

type AnyDb = typeof db

export type ApprovalActionCategory = 'read' | 'draft' | 'write' | 'admin'
export type ApprovalSourceType = 'chat' | 'meeting' | 'system'

type ApprovalDecisionInput = {
  toolSlug: string
  toolkitSlug: string
  toolkitName: string
  category: ApprovalActionCategory
  reason: string
  connectedAccountId: string | null
  connectionId: string | null
}

type TransitionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

type ToolTransitionEntry = {
  status: TransitionStatus
  at: string
  note?: string | null
  error?: string | null
}

type ApprovalPreview = {
  title: string
  summary: string
  targetText: string | null
  fieldPreview: Array<{ label: string; value: string }>
  argumentsPreview: Record<string, unknown>
}

function toLegacyToolProvider(toolkitSlug: string) {
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

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function compactValue(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return value.length > 280 ? `${value.slice(0, 280)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 6).map((item) => compactValue(item))
    if (value.length > 6) {
      items.push({ _truncatedItems: value.length - 6 })
    }
    return items
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.entries(record).slice(0, 12)
    const compacted = Object.fromEntries(
      entries.map(([key, item]) => [key, compactValue(item)])
    )
    if (Object.keys(record).length > entries.length) {
      compacted._truncatedKeys = Object.keys(record).length - entries.length
    }
    return compacted
  }
  return String(value)
}

function formatFieldValue(value: unknown) {
  if (value == null) return 'Not provided'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(compactValue(value))
}

function getTargetText(argumentsPayload: Record<string, unknown>) {
  const targetCandidates = [
    argumentsPayload.title,
    argumentsPayload.subject,
    argumentsPayload.name,
    argumentsPayload.identifier,
    argumentsPayload.id,
    argumentsPayload.issueId,
    argumentsPayload.issue_id,
    argumentsPayload.projectId,
    argumentsPayload.project_id,
    argumentsPayload.channel,
    argumentsPayload.channel_id,
    argumentsPayload.repo,
    argumentsPayload.repository,
    argumentsPayload.path,
    argumentsPayload.url,
  ]

  const match = targetCandidates.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  )

  return match?.trim() ?? null
}

function buildApprovalPreview(params: {
  argumentsPayload: Record<string, unknown>
  decision: ApprovalDecisionInput
}) {
  const targetText = getTargetText(params.argumentsPayload)
  const title = `Review ${params.decision.toolkitName} ${params.decision.category}`
  const summaryParts = [
    `${params.decision.toolkitName} wants to run ${params.decision.toolSlug}.`,
    targetText ? `Target: ${targetText}.` : null,
    params.decision.reason,
  ]

  const importantKeys = [
    'title',
    'subject',
    'name',
    'description',
    'body',
    'message',
    'channel',
    'repo',
    'repository',
    'team_id',
    'project_id',
    'assignee_id',
    'issue_id',
    'url',
  ]

  const fieldPreview = importantKeys
    .filter((key) => key in params.argumentsPayload)
    .slice(0, 8)
    .map((key) => ({
      label: key.replace(/_/g, ' '),
      value: formatFieldValue(params.argumentsPayload[key]),
    }))

  return {
    title,
    summary: summaryParts.filter(Boolean).join(' '),
    targetText,
    fieldPreview,
    argumentsPreview: compactValue(params.argumentsPayload) as Record<
      string,
      unknown
    >,
  } satisfies ApprovalPreview
}

function appendTransition(
  existing: Array<Record<string, unknown>> | null | undefined,
  next: ToolTransitionEntry
) {
  return [...(existing ?? []), next]
}

function getApprovalExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 3)
  return expiresAt
}

function isAuthFailureMessage(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('expired') ||
    normalized.includes('revoked') ||
    normalized.includes('reconnect') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('invalid grant') ||
    normalized.includes('not connected')
  )
}

export function buildApprovalResponseMessage(params: {
  created: Array<{
    approvalRequestId: string
    preview: ApprovalPreview
    toolkitName: string
    toolSlug: string
  }>
}) {
  if (params.created.length === 0) {
    return 'I couldn’t create an approval request for that action.'
  }

  if (params.created.length === 1) {
    const item = params.created[0]!
    return [
      `I prepared an approval request for ${item.toolkitName} ${item.toolSlug}.`,
      item.preview.targetText ? `Target: ${item.preview.targetText}.` : null,
      `[Review and approve it](/approvals?approvalRequestId=${item.approvalRequestId}).`,
    ]
      .filter(Boolean)
      .join(' ')
  }

  return [
    `I prepared ${params.created.length} approval requests for external actions.`,
    'Review them here:',
    ...params.created.map(
      (item) =>
        `- [${item.toolkitName} ${item.toolSlug}](/approvals?approvalRequestId=${item.approvalRequestId})`
    ),
  ].join('\n')
}

export async function queueToolApprovalRequest(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  toolCallId: string
  sessionRunId: string
  sourceType: ApprovalSourceType
  sourceId?: string | null
  decision: ApprovalDecisionInput
  argumentsPayload: Record<string, unknown>
}) {
  const preview = buildApprovalPreview({
    argumentsPayload: params.argumentsPayload,
    decision: params.decision,
  })

  const [pendingRun] = await params.db
    .insert(toolActionRuns)
    .values({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      toolConnectionId: params.decision.connectionId,
      tool: toLegacyToolProvider(params.decision.toolkitSlug),
      toolkitSlug: params.decision.toolkitSlug,
      connectedAccountId: params.decision.connectedAccountId,
      toolSessionRunId: params.sessionRunId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      action: params.decision.toolSlug,
      actionCategory: params.decision.category,
      targetText: preview.targetText,
      idempotencyKey: `${params.sessionRunId}:${params.toolCallId}:approval`,
      attemptCount: 0,
      status: 'pending',
      requestPayload: {
        toolCallId: params.toolCallId,
        arguments: params.argumentsPayload,
        preview,
      },
      transitionHistory: appendTransition(null, {
        status: 'pending',
        at: new Date().toISOString(),
        note: 'approval_requested',
      }),
    })
    .returning()

  const [approval] = await params.db
    .insert(approvalRequests)
    .values({
      orgId: params.orgId,
      requestedByUserId: params.actorUserId,
      toolSessionRunId: params.sessionRunId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      toolkitSlug: params.decision.toolkitSlug,
      connectedAccountId: params.decision.connectedAccountId,
      action: params.decision.toolSlug,
      actionCategory: params.decision.category,
      approvalType: 'tool_action_execution',
      subjectType: 'tool_action_run',
      subjectId: pendingRun!.id,
      previewPayload: {
        ...preview,
        toolkitSlug: params.decision.toolkitSlug,
        toolkitName: params.decision.toolkitName,
        action: params.decision.toolSlug,
        category: params.decision.category,
        connectedAccountId: params.decision.connectedAccountId,
      },
      requestPayload: params.argumentsPayload,
      expiresAt: getApprovalExpiryDate(),
      meetingSessionId:
        params.sourceType === 'meeting' ? (params.sourceId ?? null) : null,
    })
    .returning()

  await params.db
    .update(toolActionRuns)
    .set({
      approvalRequestId: approval!.id,
    })
    .where(eq(toolActionRuns.id as never, pendingRun!.id as never) as never)

  await logActivity(
    params.db,
    params.orgId,
    'tool_access.approval_requested',
    {
      approvalRequestId: approval!.id,
      toolkitSlug: params.decision.toolkitSlug,
      action: params.decision.toolSlug,
      connectedAccountId: params.decision.connectedAccountId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      toolActionRunId: pendingRun!.id,
    },
    params.actorUserId
  )

  return {
    approvalRequestId: approval!.id,
    toolActionRunId: pendingRun!.id,
    preview,
    toolkitName: params.decision.toolkitName,
    toolSlug: params.decision.toolSlug,
  }
}

async function createApprovalExecutionSession(params: {
  db: AnyDb
  actorUserId: string
  approvalRequestId: string
  connection: typeof toolkitConnections.$inferSelect
  orgId: string
}) {
  const composio = getComposioClient()
  const session = await composio.create(params.actorUserId, {
    toolkits: {
      enable: [params.connection.toolkitSlug],
    },
    connectedAccounts: {
      [params.connection.toolkitSlug]: params.connection.connectedAccountId,
    },
    authConfigs: params.connection.authConfigId
      ? {
          [params.connection.toolkitSlug]: params.connection.authConfigId,
        }
      : undefined,
    manageConnections: {
      enable: false,
      waitForConnections: false,
    },
    workbench: {
      enable: false,
      enableProxyExecution: false,
    },
  })

  const [sessionRun] = await params.db
    .insert(toolSessionRuns)
    .values({
      orgId: params.orgId,
      userId: params.actorUserId,
      composioSessionId: session.sessionId,
      sourceType: 'system',
      sourceId: params.approvalRequestId,
      enabledToolkits: [params.connection.toolkitSlug],
      connectedAccountOverrides: {
        [params.connection.toolkitSlug]: params.connection.connectedAccountId,
      },
      manageConnectionsInChat: false,
      workbenchEnabled: false,
      metadata: {
        approvalRequestId: params.approvalRequestId,
        executedFrom: 'approval_flow',
      },
    })
    .returning()

  if (!sessionRun) {
    throw new Error('Failed to create an approval execution tool session.')
  }

  return { session, sessionRun }
}

async function expireApprovalExecutionSession(params: {
  db: AnyDb
  sessionRunId: string | null
  metadata?: Record<string, unknown>
}) {
  if (!params.sessionRunId) return

  await params.db
    .update(toolSessionRuns)
    .set({
      expiredAt: new Date(),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })
    .where(
      eq(toolSessionRuns.id as never, params.sessionRunId as never) as never
    )
}

export async function listToolApprovalRequests(params: {
  db: AnyDb
  orgId: string
  status?: 'pending' | 'approved' | 'rejected' | 'expired'
  limit?: number
}) {
  const rows = await params.db.query.approvalRequests.findMany({
    where: (fields, operators) =>
      params.status
        ? operators.and(
            operators.eq(fields.orgId, params.orgId),
            operators.eq(fields.status, params.status)
          )
        : operators.eq(fields.orgId, params.orgId),
    orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    limit: params.limit ?? 50,
    with: {
      requestedByUser: true,
      decidedByUser: true,
    },
  })

  const toolRuns =
    rows.length > 0
      ? await params.db.query.toolActionRuns.findMany({
          where: (fields, operators) =>
            operators.or(
              ...rows.map((row) =>
                operators.eq(fields.approvalRequestId, row.id)
              )
            )!,
          orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
        })
      : []
  const toolRunsByApprovalId = new Map(
    toolRuns
      .filter((row) => row.approvalRequestId)
      .map((row) => [row.approvalRequestId!, row] as const)
  )

  return rows.map((row) => ({
    executionStatus: toolRunsByApprovalId.get(row.id)?.status ?? null,
    executionError: toolRunsByApprovalId.get(row.id)?.error ?? null,
    attemptCount: toolRunsByApprovalId.get(row.id)?.attemptCount ?? 0,
    targetText: toolRunsByApprovalId.get(row.id)?.targetText ?? null,
    id: row.id,
    status: row.status,
    approvalType: row.approvalType,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    toolkitSlug: row.toolkitSlug,
    connectedAccountId: row.connectedAccountId,
    action: row.action,
    actionCategory: row.actionCategory,
    previewPayload: row.previewPayload,
    requestPayload: row.requestPayload,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    requestedByUser: row.requestedByUser
      ? {
          id: row.requestedByUser.id,
          name: row.requestedByUser.name,
          email: row.requestedByUser.email,
        }
      : null,
    decidedByUser: row.decidedByUser
      ? {
          id: row.decidedByUser.id,
          name: row.decidedByUser.name,
          email: row.decidedByUser.email,
        }
      : null,
  }))
}

export async function decideToolApprovalRequest(params: {
  approvalRequestId: string
  db: AnyDb
  decision: 'approved' | 'rejected'
  orgId: string
  decidedByUserId: string
}) {
  const approval = await params.db.query.approvalRequests.findFirst({
    where: (fields, operators) =>
      operators.and(
        operators.eq(fields.id, params.approvalRequestId),
        operators.eq(fields.orgId, params.orgId)
      ),
  })

  if (!approval) {
    throw new Error('Approval request not found.')
  }

  if (approval.status !== 'pending') {
    throw new Error('This approval request has already been decided.')
  }

  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
    await params.db
      .update(approvalRequests)
      .set({
        status: 'expired',
        decidedAt: new Date(),
        decidedByUserId: params.decidedByUserId,
      })
      .where(
        eq(
          approvalRequests.id as never,
          params.approvalRequestId as never
        ) as never
      )

    throw new Error('This approval request has expired.')
  }

  const toolRun = await params.db.query.toolActionRuns.findFirst({
    where: (fields, operators) =>
      operators.and(
        operators.eq(fields.approvalRequestId, params.approvalRequestId),
        operators.eq(fields.orgId, params.orgId)
      ),
  })

  if (!toolRun) {
    throw new Error(
      'The pending tool action for this approval could not be found.'
    )
  }

  if (params.decision === 'rejected') {
    await params.db
      .update(approvalRequests)
      .set({
        status: 'rejected',
        decidedAt: new Date(),
        decidedByUserId: params.decidedByUserId,
      })
      .where(
        eq(
          approvalRequests.id as never,
          params.approvalRequestId as never
        ) as never
      )

    await params.db
      .update(toolActionRuns)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        transitionHistory: appendTransition(toolRun.transitionHistory, {
          status: 'cancelled',
          at: new Date().toISOString(),
          note: 'approval_rejected',
        }),
      })
      .where(eq(toolActionRuns.id as never, toolRun.id as never) as never)

    await logActivity(
      params.db,
      params.orgId,
      'tool_access.approval_rejected',
      {
        approvalRequestId: params.approvalRequestId,
        toolActionRunId: toolRun.id,
        toolkitSlug: approval.toolkitSlug,
        action: approval.action,
      },
      params.decidedByUserId
    )

    return {
      approvalRequestId: params.approvalRequestId,
      status: 'rejected' as const,
      message: 'Approval rejected. The external action was not executed.',
    }
  }

  const actorUserId = approval.requestedByUserId
  if (!actorUserId) {
    throw new Error(
      'The original requester is no longer available for this action.'
    )
  }

  const requestPayload = asRecord(toolRun.requestPayload)
  const argumentsPayload =
    requestPayload && asRecord(requestPayload.arguments)
      ? (requestPayload.arguments as Record<string, unknown>)
      : asRecord(approval.requestPayload)

  if (!argumentsPayload) {
    throw new Error(
      'The approval request is missing the original tool arguments.'
    )
  }

  const connection = await params.db.query.toolkitConnections.findFirst({
    where: (fields, operators) =>
      operators.and(
        operators.eq(fields.orgId, params.orgId),
        operators.eq(fields.userId, actorUserId),
        approval.connectedAccountId
          ? operators.eq(fields.connectedAccountId, approval.connectedAccountId)
          : operators.eq(fields.id, toolRun.toolConnectionId ?? '')
      ),
  })

  if (!connection) {
    throw new Error(
      'The connected account for this approval is no longer available.'
    )
  }

  const refreshedConnection =
    connection.connectedAccountStatus === 'ACTIVE'
      ? connection
      : await revalidatePersistedConnection(params.db, connection)

  if (
    !refreshedConnection ||
    refreshedConnection.connectedAccountStatus !== 'ACTIVE'
  ) {
    throw new Error(
      'Reconnect this integration before approving the action again.'
    )
  }

  const policy = getEffectiveToolkitPolicy(
    await params.db.query.toolkitPolicies.findFirst({
      where: (fields, operators) =>
        operators.and(
          operators.eq(fields.orgId, params.orgId),
          operators.eq(fields.toolkitSlug, refreshedConnection.toolkitSlug)
        ),
    }),
    refreshedConnection.toolkitSlug
  )

  if (!policy.enabled) {
    throw new Error(
      'Workspace policy disabled this toolkit before approval could run.'
    )
  }

  const approvalUpdatedAt = new Date()
  await params.db
    .update(approvalRequests)
    .set({
      status: 'approved',
      decidedAt: approvalUpdatedAt,
      decidedByUserId: params.decidedByUserId,
    })
    .where(eq(approvalRequests.id as never, approval.id as never) as never)

  const { session, sessionRun } = await createApprovalExecutionSession({
    db: params.db,
    actorUserId,
    approvalRequestId: approval.id,
    connection: refreshedConnection,
    orgId: params.orgId,
  })

  const runningTransitionHistory = appendTransition(toolRun.transitionHistory, {
    status: 'running',
    at: new Date().toISOString(),
    note: 'approval_approved',
  })

  await params.db
    .update(toolActionRuns)
    .set({
      toolConnectionId: refreshedConnection.id,
      toolSessionRunId: sessionRun.id,
      connectedAccountId: refreshedConnection.connectedAccountId,
      sourceType: approval.sourceType ?? 'system',
      sourceId: approval.sourceId ?? approval.id,
      status: 'running',
      attemptCount: (toolRun.attemptCount ?? 0) + 1,
      startedAt: new Date(),
      transitionHistory: runningTransitionHistory,
      error: null,
    })
    .where(eq(toolActionRuns.id as never, toolRun.id as never) as never)

  try {
    const scopedSession = await getComposioClient().toolRouter.use(
      session.sessionId
    )
    const response = (await scopedSession.execute(
      toolRun.action,
      argumentsPayload
    )) as {
      data?: Record<string, unknown>
      error?: string | null
      logId?: string | null
    }

    const succeeded = !response.error
    await params.db
      .update(toolActionRuns)
      .set({
        status: succeeded ? 'succeeded' : 'failed',
        responsePayload: {
          success: succeeded,
          error: response.error ?? null,
          data: response.data ?? null,
          logId: response.logId ?? null,
        },
        externalLogId: response.logId ?? null,
        error: response.error ?? null,
        completedAt: new Date(),
        transitionHistory: appendTransition(runningTransitionHistory, {
          status: succeeded ? 'succeeded' : 'failed',
          at: new Date().toISOString(),
          error: response.error ?? null,
        }),
      })
      .where(eq(toolActionRuns.id as never, toolRun.id as never) as never)

    await expireApprovalExecutionSession({
      db: params.db,
      sessionRunId: sessionRun.id,
      metadata: {
        approvalRequestId: approval.id,
        executedAction: toolRun.action,
        success: succeeded,
      },
    })

    await logActivity(
      params.db,
      params.orgId,
      succeeded
        ? 'tool_access.approval_executed'
        : 'tool_access.approval_execution_failed',
      {
        approvalRequestId: approval.id,
        toolActionRunId: toolRun.id,
        toolkitSlug: approval.toolkitSlug,
        action: approval.action,
        logId: response.logId ?? null,
        error: response.error ?? null,
      },
      params.decidedByUserId
    )

    return {
      approvalRequestId: approval.id,
      status: succeeded ? ('succeeded' as const) : ('failed' as const),
      message: succeeded
        ? 'Approval granted and the external action executed successfully.'
        : (response.error ??
          'Approval granted, but the external action failed during execution.'),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The approved action failed.'

    if (isAuthFailureMessage(message)) {
      await markPersistedConnectionAttention(
        params.db,
        refreshedConnection.id,
        {
          status: 'FAILED',
          errorMessage: message,
        }
      )
    }

    await params.db
      .update(toolActionRuns)
      .set({
        status: 'failed',
        error: message,
        completedAt: new Date(),
        transitionHistory: appendTransition(runningTransitionHistory, {
          status: 'failed',
          at: new Date().toISOString(),
          error: message,
        }),
      })
      .where(eq(toolActionRuns.id as never, toolRun.id as never) as never)

    await expireApprovalExecutionSession({
      db: params.db,
      sessionRunId: sessionRun.id,
      metadata: {
        approvalRequestId: approval.id,
        executedAction: toolRun.action,
        success: false,
        error: message,
      },
    })

    await logActivity(
      params.db,
      params.orgId,
      'tool_access.approval_execution_failed',
      {
        approvalRequestId: approval.id,
        toolActionRunId: toolRun.id,
        toolkitSlug: approval.toolkitSlug,
        action: approval.action,
        error: message,
      },
      params.decidedByUserId
    )

    throw error
  }
}
