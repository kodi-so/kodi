/**
 * work-item-sync.ts
 *
 * Handles queueing and direct execution of work item syncs to external tools
 * (Linear, GitHub) and meeting recap delivery (Slack, Zoom Team Chat).
 *
 * The flow for each operation:
 *   1. Build the Composio action + payload for the target toolkit.
 *   2. Check the org's toolkit policy (writesRequireApproval).
 *   3a. If approval required → insert a toolActionRun (pending) + approvalRequest.
 *       The operator approves in /approvals; decideToolApprovalRequest executes.
 *   3b. If direct execution allowed → create a Composio session, execute, update
 *       the work item / mark the run completed.
 */

import {
  approvalRequests,
  db,
  eq,
  meetingArtifacts,
  toolActionRuns,
  toolSessionRuns,
  workItems,
} from '@kodi/db'
import type { ToolkitConnection, WorkItem } from '@kodi/db'
import {
  choosePrimaryConnection,
  getComposioClient,
  getEffectiveToolkitPolicy,
  listPersistedConnections,
  listToolkitAccountPreferences,
  listToolkitPolicies,
} from '../composio'
import { logActivity } from '../activity'

type AnyDb = typeof db

// ---------------------------------------------------------------------------
// Supported sync targets
// ---------------------------------------------------------------------------

export type WorkItemSyncTarget = 'linear' | 'github'
export type RecapDeliveryTarget = 'slack' | 'zoom'

// ---------------------------------------------------------------------------
// Composio action names
// ---------------------------------------------------------------------------

const COMPOSIO_ACTION: Record<WorkItemSyncTarget | RecapDeliveryTarget, string> =
  {
    linear: 'LINEAR_CREATE_ISSUE',
    github: 'GITHUB_CREATE_ISSUE',
    slack: 'SLACK_SEND_MESSAGE',
    zoom: 'ZOOM_SEND_TEAM_CHAT_MESSAGE',
  }

const TOOLKIT_DISPLAY_NAME: Record<WorkItemSyncTarget | RecapDeliveryTarget, string> = {
  linear: 'Linear',
  github: 'GitHub',
  slack: 'Slack',
  zoom: 'Zoom',
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

type SyncPlan = {
  action: string
  argumentsPayload: Record<string, unknown>
  previewTitle: string
  previewSummary: string
  targetText: string | null
}

export function buildWorkItemSyncPlan(
  workItem: WorkItem,
  target: WorkItemSyncTarget
): SyncPlan {
  const action = COMPOSIO_ACTION[target]
  const toolName = TOOLKIT_DISPLAY_NAME[target]

  if (target === 'linear') {
    return {
      action,
      argumentsPayload: {
        title: workItem.title,
        description: workItem.description ?? undefined,
        priority: linearPriority(workItem.priority),
        dueDate: workItem.dueAt ? workItem.dueAt.toISOString().split('T')[0] : undefined,
      },
      previewTitle: `Create Linear issue: ${workItem.title}`,
      previewSummary: `Creates a ${workItem.kind} in Linear from this approved meeting action item.`,
      targetText: workItem.title,
    }
  }

  // github
  return {
    action,
    argumentsPayload: {
      title: workItem.title,
      body: workItem.description ?? undefined,
    },
    previewTitle: `Create GitHub issue: ${workItem.title}`,
    previewSummary: `Creates a GitHub issue from this approved meeting action item.`,
    targetText: workItem.title,
  }
}

export function buildMeetingRecapPlan(params: {
  meetingTitle: string | null
  summaryContent: string
  target: RecapDeliveryTarget
  channelId?: string | null
}): SyncPlan {
  const action = COMPOSIO_ACTION[params.target]
  const toolName = TOOLKIT_DISPLAY_NAME[params.target]
  const title = params.meetingTitle ?? 'Meeting'
  const message = `*${title} — Meeting Recap*\n\n${params.summaryContent}`

  if (params.target === 'slack') {
    return {
      action,
      argumentsPayload: {
        channel: params.channelId ?? undefined,
        text: message,
      },
      previewTitle: `Send recap to Slack`,
      previewSummary: `Delivers the meeting summary to a Slack channel.`,
      targetText: params.channelId ?? null,
    }
  }

  // zoom team chat
  return {
    action,
    argumentsPayload: {
      channel_id: params.channelId ?? undefined,
      message,
    },
    previewTitle: `Send recap via Zoom Team Chat`,
    previewSummary: `Delivers the meeting summary to a Zoom Team Chat channel.`,
    targetText: params.channelId ?? null,
  }
}

// ---------------------------------------------------------------------------
// External result extraction
// ---------------------------------------------------------------------------

/**
 * Try to extract { externalId, externalUrl } from a Composio response payload
 * after a successful issue-creation action. Each toolkit has a different shape.
 */
export function extractExternalResult(
  target: WorkItemSyncTarget,
  responseData: Record<string, unknown> | null | undefined
): { externalId: string | null; externalUrl: string | null } {
  if (!responseData) return { externalId: null, externalUrl: null }

  const flat = flattenResponse(responseData)

  if (target === 'linear') {
    // LINEAR_CREATE_ISSUE may nest under createIssue.issue or issue
    return {
      externalId:
        asString(flat['createIssue.issue.identifier']) ??
        asString(flat['issue.identifier']) ??
        asString(flat['identifier']) ??
        asString(flat['id']) ??
        null,
      externalUrl:
        asString(flat['createIssue.issue.url']) ??
        asString(flat['issue.url']) ??
        asString(flat['url']) ??
        null,
    }
  }

  // github
  return {
    externalId:
      asString(flat['number']) ??
      asString(flat['data.number']) ??
      null,
    externalUrl:
      asString(flat['html_url']) ??
      asString(flat['data.html_url']) ??
      null,
  }
}

// ---------------------------------------------------------------------------
// Public queue functions
// ---------------------------------------------------------------------------

export type QueueWorkItemSyncParams = {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItem: WorkItem
  target: WorkItemSyncTarget
}

export type QueueResult =
  | { mode: 'queued'; approvalRequestId: string }
  | { mode: 'executed'; externalId: string | null; externalUrl: string | null }

/**
 * Queue (or directly execute) a work item sync to the given external tool.
 * Resolves the user's active Composio connection for that toolkit, checks the
 * workspace policy, and either creates an approval request or runs immediately.
 */
export async function queueWorkItemSync(
  params: QueueWorkItemSyncParams
): Promise<QueueResult> {
  const { connection, policy } = await resolveConnectionAndPolicy(
    params.db,
    params.orgId,
    params.actorUserId,
    params.target
  )

  if (!policy.enabled) {
    throw new Error(`The ${TOOLKIT_DISPLAY_NAME[params.target]} toolkit is disabled in this workspace.`)
  }

  const plan = buildWorkItemSyncPlan(params.workItem, params.target)

  if (policy.writesRequireApproval) {
    const approvalRequestId = await insertWorkItemSyncApproval({
      db: params.db,
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      workItemId: params.workItem.id,
      meetingSessionId: params.workItem.meetingSessionId ?? null,
      toolkitSlug: params.target,
      connectedAccountId: connection.connectedAccountId,
      plan,
    })

    return { mode: 'queued', approvalRequestId }
  }

  // Direct execution
  const result = await executeSync({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    workItemId: params.workItem.id,
    meetingSessionId: params.workItem.meetingSessionId ?? null,
    toolkitSlug: params.target,
    connection,
    plan,
  })

  return { mode: 'executed', ...result }
}

export type QueueMeetingRecapParams = {
  db: AnyDb
  orgId: string
  actorUserId: string
  meetingSessionId: string
  meetingTitle: string | null
  target: RecapDeliveryTarget
  channelId?: string | null
}

/**
 * Queue (or directly execute) a meeting recap delivery to Slack or Zoom.
 */
export async function queueMeetingRecap(
  params: QueueMeetingRecapParams
): Promise<QueueResult> {
  // Load the summary artifact
  const summaryArtifact = await params.db.query.meetingArtifacts.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.meetingSessionId, params.meetingSessionId),
        eq(fields.artifactType, 'summary')
      ),
  })

  if (!summaryArtifact?.content) {
    throw new Error('No meeting summary is available to deliver.')
  }

  const { connection, policy } = await resolveConnectionAndPolicy(
    params.db,
    params.orgId,
    params.actorUserId,
    params.target
  )

  if (!policy.enabled) {
    throw new Error(`The ${TOOLKIT_DISPLAY_NAME[params.target]} toolkit is disabled in this workspace.`)
  }

  const plan = buildMeetingRecapPlan({
    meetingTitle: params.meetingTitle,
    summaryContent: summaryArtifact.content,
    target: params.target,
    channelId: params.channelId,
  })

  if (policy.writesRequireApproval) {
    const approvalRequestId = await insertWorkItemSyncApproval({
      db: params.db,
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      workItemId: null,
      meetingSessionId: params.meetingSessionId,
      toolkitSlug: params.target,
      connectedAccountId: connection.connectedAccountId,
      plan,
    })

    return { mode: 'queued', approvalRequestId }
  }

  const result = await executeSync({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    workItemId: null,
    meetingSessionId: params.meetingSessionId,
    toolkitSlug: params.target,
    connection,
    plan,
  })

  return { mode: 'executed', ...result }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type TransitionEntry = {
  status: string
  at: string
  note?: string | null
  error?: string | null
}

function appendTransition(
  existing: Array<Record<string, unknown>> | null | undefined,
  next: TransitionEntry
) {
  return [...(existing ?? []), next]
}

async function resolveConnectionAndPolicy(
  dbInstance: AnyDb,
  orgId: string,
  userId: string,
  toolkitSlug: string
) {
  const [connections, policies, preferences] = await Promise.all([
    listPersistedConnections(dbInstance, orgId, userId),
    listToolkitPolicies(dbInstance, orgId),
    listToolkitAccountPreferences(dbInstance, orgId, userId),
  ])

  const toolConnections = connections.filter((c) => c.toolkitSlug === toolkitSlug)
  const preference = preferences.find((p) => p.toolkitSlug === toolkitSlug)
  const connection = choosePrimaryConnection(
    toolConnections,
    preference?.preferredConnectedAccountId ?? null
  )

  if (!connection || connection.connectedAccountStatus !== 'ACTIVE') {
    throw new Error(
      `No active ${TOOLKIT_DISPLAY_NAME[toolkitSlug as WorkItemSyncTarget | RecapDeliveryTarget] ?? toolkitSlug} connection found. Connect an account in Integrations first.`
    )
  }

  const rawPolicy = policies.find((p) => p.toolkitSlug === toolkitSlug) ?? null
  const policy = getEffectiveToolkitPolicy(rawPolicy, toolkitSlug)

  return { connection, policy }
}

async function insertWorkItemSyncApproval(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string | null
  meetingSessionId: string | null
  toolkitSlug: string
  connectedAccountId: string
  plan: SyncPlan
}): Promise<string> {
  const idempotencyKey = [
    'work_item_sync',
    params.workItemId ?? params.meetingSessionId ?? 'unknown',
    params.toolkitSlug,
    Date.now().toString(),
  ].join(':')

  const [run] = await params.db
    .insert(toolActionRuns)
    .values({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      workItemId: params.workItemId,
      meetingSessionId: params.meetingSessionId,
      toolkitSlug: params.toolkitSlug,
      connectedAccountId: params.connectedAccountId,
      sourceType: 'meeting',
      sourceId: params.meetingSessionId ?? params.workItemId,
      action: params.plan.action,
      actionCategory: 'write',
      targetText: params.plan.targetText,
      idempotencyKey,
      attemptCount: 0,
      status: 'pending',
      requestPayload: {
        arguments: params.plan.argumentsPayload,
        preview: {
          title: params.plan.previewTitle,
          summary: params.plan.previewSummary,
          targetText: params.plan.targetText,
          fieldPreview: Object.entries(params.plan.argumentsPayload)
            .filter(([, v]) => v != null && typeof v !== 'object')
            .slice(0, 8)
            .map(([label, value]) => ({
              label: label.replace(/_/g, ' '),
              value: String(value),
            })),
        },
      },
      transitionHistory: appendTransition(null, {
        status: 'pending',
        at: new Date().toISOString(),
        note: 'approval_requested',
      }),
    })
    .returning()

  if (!run) throw new Error('Failed to create tool action run.')

  const previewPayload: Record<string, unknown> = {
    title: params.plan.previewTitle,
    summary: params.plan.previewSummary,
    targetText: params.plan.targetText,
    toolkitSlug: params.toolkitSlug,
    action: params.plan.action,
    category: 'write',
    connectedAccountId: params.connectedAccountId,
    fieldPreview: Object.entries(params.plan.argumentsPayload)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .slice(0, 8)
      .map(([label, value]) => ({
        label: label.replace(/_/g, ' '),
        value: String(value),
      })),
  }

  const [approval] = await params.db
    .insert(approvalRequests)
    .values({
      orgId: params.orgId,
      requestedByUserId: params.actorUserId,
      meetingSessionId: params.meetingSessionId,
      sourceType: 'meeting',
      sourceId: params.meetingSessionId ?? params.workItemId,
      toolkitSlug: params.toolkitSlug,
      connectedAccountId: params.connectedAccountId,
      action: params.plan.action,
      actionCategory: 'write',
      approvalType: params.workItemId ? 'work_item_sync' : 'recap_delivery',
      subjectType: params.workItemId ? 'work_item' : 'meeting_session',
      subjectId: params.workItemId ?? params.meetingSessionId ?? 'unknown',
      previewPayload,
      requestPayload: params.plan.argumentsPayload,
      expiresAt: approvalExpiresAt(),
    })
    .returning()

  if (!approval) throw new Error('Failed to create approval request.')

  // Link the approval back to the run
  await params.db
    .update(toolActionRuns)
    .set({ approvalRequestId: approval.id })
    .where(eq(toolActionRuns.id as never, run.id as never) as never)

  await logActivity(
    params.db,
    params.orgId,
    'tool_access.approval_requested',
    {
      approvalRequestId: approval.id,
      toolkitSlug: params.toolkitSlug,
      action: params.plan.action,
      workItemId: params.workItemId,
      meetingSessionId: params.meetingSessionId,
      toolActionRunId: run.id,
    },
    params.actorUserId
  )

  return approval.id
}

async function executeSync(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  workItemId: string | null
  meetingSessionId: string | null
  toolkitSlug: string
  connection: ToolkitConnection
  plan: SyncPlan
}): Promise<{ externalId: string | null; externalUrl: string | null }> {
  const composio = getComposioClient()
  const idempotencyKey = [
    'work_item_sync_direct',
    params.workItemId ?? params.meetingSessionId ?? 'unknown',
    params.toolkitSlug,
    Date.now().toString(),
  ].join(':')

  // Create a Composio session for this execution
  const session = await composio.create(params.actorUserId, {
    toolkits: { enable: [params.toolkitSlug] },
    connectedAccounts: {
      [params.toolkitSlug]: params.connection.connectedAccountId,
    },
    authConfigs: params.connection.authConfigId
      ? { [params.toolkitSlug]: params.connection.authConfigId }
      : undefined,
    manageConnections: { enable: false, waitForConnections: false },
    workbench: { enable: false, enableProxyExecution: false },
  })

  const [sessionRun] = await params.db
    .insert(toolSessionRuns)
    .values({
      orgId: params.orgId,
      userId: params.actorUserId,
      composioSessionId: session.sessionId,
      sourceType: 'meeting',
      sourceId: params.meetingSessionId ?? params.workItemId,
      enabledToolkits: [params.toolkitSlug],
      connectedAccountOverrides: {
        [params.toolkitSlug]: params.connection.connectedAccountId,
      },
      manageConnectionsInChat: false,
      workbenchEnabled: false,
      metadata: {
        workItemId: params.workItemId,
        meetingSessionId: params.meetingSessionId,
        executedFrom: 'direct_sync',
      },
    })
    .returning()

  if (!sessionRun) throw new Error('Failed to create tool session run.')

  const [run] = await params.db
    .insert(toolActionRuns)
    .values({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      workItemId: params.workItemId,
      meetingSessionId: params.meetingSessionId,
      toolkitSlug: params.toolkitSlug,
      connectedAccountId: params.connection.connectedAccountId,
      toolConnectionId: null,
      toolSessionRunId: sessionRun.id,
      sourceType: 'meeting',
      sourceId: params.meetingSessionId ?? params.workItemId,
      action: params.plan.action,
      actionCategory: 'write',
      targetText: params.plan.targetText,
      idempotencyKey,
      attemptCount: 1,
      status: 'running',
      startedAt: new Date(),
      requestPayload: { arguments: params.plan.argumentsPayload },
      transitionHistory: appendTransition(null, {
        status: 'running',
        at: new Date().toISOString(),
        note: 'direct_execution',
      }),
    })
    .returning()

  if (!run) throw new Error('Failed to create tool action run.')

  let externalId: string | null = null
  let externalUrl: string | null = null

  try {
    const scopedSession = await composio.toolRouter.use(session.sessionId)
    const response = (await scopedSession.execute(
      params.plan.action,
      params.plan.argumentsPayload
    )) as { data?: Record<string, unknown>; error?: string | null; logId?: string | null }

    const succeeded = !response.error
    const extracted = succeeded
      ? extractExternalResult(params.toolkitSlug as WorkItemSyncTarget, response.data)
      : { externalId: null, externalUrl: null }
    externalId = extracted.externalId
    externalUrl = extracted.externalUrl

    const finalTransitions = appendTransition(run.transitionHistory, {
      status: succeeded ? 'succeeded' : 'failed',
      at: new Date().toISOString(),
      error: response.error ?? null,
    })

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
        transitionHistory: finalTransitions,
      })
      .where(eq(toolActionRuns.id as never, run.id as never) as never)

    if (succeeded && params.workItemId) {
      await updateWorkItemAfterSync(
        params.db,
        params.workItemId,
        params.toolkitSlug as WorkItemSyncTarget,
        externalId,
        externalUrl
      )
    }

    await params.db
      .update(toolSessionRuns)
      .set({ expiredAt: new Date() })
      .where(eq(toolSessionRuns.id as never, sessionRun.id as never) as never)

    await logActivity(
      params.db,
      params.orgId,
      succeeded ? 'tool_access.approval_executed' : 'tool_access.approval_execution_failed',
      {
        toolkitSlug: params.toolkitSlug,
        action: params.plan.action,
        workItemId: params.workItemId,
        toolActionRunId: run.id,
        externalId,
        error: response.error ?? null,
      },
      params.actorUserId
    )

    if (!succeeded) {
      throw new Error(response.error ?? 'Execution failed with no error message.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed.'
    await params.db
      .update(toolActionRuns)
      .set({
        status: 'failed',
        error: message,
        completedAt: new Date(),
        transitionHistory: appendTransition(run.transitionHistory, {
          status: 'failed',
          at: new Date().toISOString(),
          error: message,
        }),
      })
      .where(eq(toolActionRuns.id as never, run.id as never) as never)

    await params.db
      .update(toolSessionRuns)
      .set({ expiredAt: new Date() })
      .where(eq(toolSessionRuns.id as never, sessionRun.id as never) as never)

    throw error
  }

  return { externalId, externalUrl }
}

/**
 * Called after a successful tool action run when the run is linked to a work item.
 * Updates externalSystem, externalId, and status on the work item.
 */
export async function updateWorkItemAfterSync(
  dbInstance: AnyDb,
  workItemId: string,
  toolkitSlug: WorkItemSyncTarget,
  externalId: string | null,
  externalUrl: string | null
) {
  // Merge externalUrl into metadata without clobbering ownerHint etc.
  let newMetadata: Record<string, unknown> | undefined
  if (externalUrl) {
    const item = await dbInstance.query.workItems.findFirst({
      where: (fields, { eq }) => eq(fields.id, workItemId),
      columns: { metadata: true },
    })
    newMetadata = { ...(item?.metadata ?? {}), externalUrl }
  }

  await dbInstance
    .update(workItems)
    .set({
      status: 'synced',
      externalSystem: toolkitSlug,
      externalId: externalId ?? undefined,
      metadata: newMetadata,
      updatedAt: new Date(),
    } as never)
    .where(eq(workItems.id as never, workItemId as never) as never)
}

// ---------------------------------------------------------------------------
// Retry a failed tool action run for a work item sync
// ---------------------------------------------------------------------------

export async function retryWorkItemSync(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  originalRunId: string
}): Promise<QueueResult> {
  const originalRun = await params.db.query.toolActionRuns.findFirst({
    where: (fields, { and, eq }) =>
      and(
        eq(fields.id, params.originalRunId),
        eq(fields.orgId, params.orgId)
      ),
  })

  if (!originalRun) {
    throw new Error('Tool action run not found.')
  }

  if (!['failed', 'cancelled'].includes(originalRun.status)) {
    throw new Error('Only failed or cancelled runs can be retried.')
  }

  const toolkitSlug = originalRun.toolkitSlug
  if (!toolkitSlug) throw new Error('Cannot retry run without a toolkit slug.')

  const requestPayload = originalRun.requestPayload as Record<string, unknown> | null
  const argumentsPayload = (requestPayload?.arguments ?? requestPayload) as Record<string, unknown> | null

  if (!argumentsPayload) {
    throw new Error('Original run is missing the arguments payload.')
  }

  const { connection, policy } = await resolveConnectionAndPolicy(
    params.db,
    params.orgId,
    params.actorUserId,
    toolkitSlug
  )

  if (!policy.enabled) {
    throw new Error(`The ${toolkitSlug} toolkit is disabled in this workspace.`)
  }

  const plan: SyncPlan = {
    action: originalRun.action,
    argumentsPayload,
    previewTitle: `Retry: ${originalRun.action}`,
    previewSummary: `Retry of a previously failed ${toolkitSlug} action.`,
    targetText: originalRun.targetText,
  }

  if (policy.writesRequireApproval) {
    const approvalRequestId = await insertWorkItemSyncApproval({
      db: params.db,
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      workItemId: originalRun.workItemId,
      meetingSessionId: originalRun.meetingSessionId,
      toolkitSlug,
      connectedAccountId: connection.connectedAccountId,
      plan,
    })

    return { mode: 'queued', approvalRequestId }
  }

  const result = await executeSync({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    workItemId: originalRun.workItemId,
    meetingSessionId: originalRun.meetingSessionId,
    toolkitSlug,
    connection,
    plan,
  })

  return { mode: 'executed', ...result }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function linearPriority(priority: string | null | undefined): number | undefined {
  if (!priority) return undefined
  const map: Record<string, number> = {
    urgent: 1,
    high: 2,
    normal: 3,
    medium: 3,
    low: 4,
  }
  return map[priority.toLowerCase()] ?? undefined
}

function approvalExpiresAt() {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d
}

/** Recursively flatten a nested object into dot-separated key paths. */
function flattenResponse(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    result[path] = value
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenResponse(value as Record<string, unknown>, path))
    }
  }
  return result
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}
