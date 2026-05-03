import type { ApprovalQueue, PendingApproval, ResolvedStatus } from './approval-queue'

/**
 * Resume an agent session after a deferred approval lands (KOD-416 / M5-T9).
 *
 * The agent's original turn returned with "queued for approval" hours
 * (or days) ago. We can't un-suspend that turn — we resume by injecting
 * a fresh user-side message into the same session via the
 * `runtime.subagent.run` primitive identified in the M5-T9 spike. The
 * agent picks up, processes the result, and replies in-channel. The
 * user sees the back-and-forth in the same transcript.
 *
 * See `docs/openclaw-bridge/spike/m5-session-injection.md` for the
 * primitive's contract.
 */

const MAX_RESULT_PREVIEW_CHARS = 500
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_INITIAL_BACKOFF_MS = 250

export type SessionInjectFn = (params: {
  sessionKey: string
  message: string
}) => Promise<{ runId: string }>

export type EmitOrphanFn = (entry: PendingApproval) => Promise<void>

export type CreateResumeOptions = {
  queue: ApprovalQueue
  /** Wraps `runtime.subagent.run` with sessionKey + message. */
  inject: SessionInjectFn
  /** Called when we give up after retries (the entry is marked
   * `'orphaned'`); typically wired to the event-bus to emit a
   * `tool.approval_resolved` with `approved: false, reason: 'orphan'`. */
  onOrphan?: EmitOrphanFn
  /** Test seam: defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Test seam: max attempts including the first call. Default 3. */
  maxRetries?: number
  /** Test seam: initial backoff before doubling. Default 250ms. */
  initialBackoffMs?: number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

export type ResumeInput =
  | {
      request_id: string
      approved: true
      /** Tool execution result. Stringified for the message. */
      result?: unknown
    }
  | {
      request_id: string
      approved: false
      /** Optional reason shown to the user in the deny message. */
      reason?: string
    }

export type ResumeOutcome =
  | { kind: 'resumed'; runId: string; approval: PendingApproval }
  | { kind: 'orphaned'; reason: 'session_unreachable' | 'unknown_request_id' }

/**
 * Truncate the result preview to ~500 chars. KOD-416 spec mentions
 * "summarize and stash full result in a session-scoped file" for over-
 * length payloads — we ship truncation now and leave the file-stash to
 * a follow-up if it becomes useful (typical Composio outputs are well
 * under 500 chars).
 */
function previewResult(result: unknown): string {
  if (result === undefined) return ''
  let s: string
  if (typeof result === 'string') {
    s = result
  } else {
    try {
      s = JSON.stringify(result)
    } catch {
      s = String(result)
    }
  }
  if (s.length <= MAX_RESULT_PREVIEW_CHARS) return s
  const truncated = s.slice(0, MAX_RESULT_PREVIEW_CHARS - 1)
  return `${truncated}…[truncated, ${s.length - MAX_RESULT_PREVIEW_CHARS + 1} chars]`
}

export function composeApprovalMessage(
  approval: PendingApproval,
  input: ResumeInput,
): string {
  if (input.approved) {
    const preview = previewResult(input.result)
    if (preview.length === 0) {
      return `[Kodi · Approval granted] Action ${approval.tool_name} ran successfully.`
    }
    return `[Kodi · Approval granted] Action ${approval.tool_name} ran with result: ${preview}`
  }
  const reason = input.reason ?? 'no reason given'
  return `[Kodi · Approval denied] ${reason}. Action ${approval.tool_name} was not performed.`
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export type ResumeApi = {
  resumeAgentAfterApproval: (input: ResumeInput) => Promise<ResumeOutcome>
}

export function createResume(opts: CreateResumeOptions): ResumeApi {
  const {
    queue,
    inject,
    onOrphan,
    sleep = defaultSleep,
    maxRetries = DEFAULT_MAX_RETRIES,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    logger = console,
  } = opts

  async function injectWithRetry(
    sessionKey: string,
    message: string,
  ): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
    let backoff = initialBackoffMs
    let lastError = 'unknown'
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await inject({ sessionKey, message })
        return { ok: true, runId: result.runId }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        logger.warn(
          JSON.stringify({
            msg: 'autonomy.resume.inject_failed',
            attempt,
            sessionKey,
            error: lastError,
          }),
        )
        if (attempt < maxRetries) {
          await sleep(backoff)
          backoff *= 2
        }
      }
    }
    return { ok: false, error: lastError }
  }

  async function resumeAgentAfterApproval(
    input: ResumeInput,
  ): Promise<ResumeOutcome> {
    const approval = await queue.get(input.request_id)
    if (!approval) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.resume.unknown_request_id',
          request_id: input.request_id,
        }),
      )
      return { kind: 'orphaned', reason: 'unknown_request_id' }
    }

    const message = composeApprovalMessage(approval, input)
    const result = await injectWithRetry(approval.session_key, message)

    if (!result.ok) {
      // All retries exhausted — agent session unreachable. Mark the
      // queue entry as orphaned so ops can see it, fire the event,
      // and return.
      const orphanedStatus: ResolvedStatus = 'orphaned'
      await queue.markResolved(
        approval.request_id,
        orphanedStatus,
        `inject_failed: ${result.error}`,
      )
      const after = (await queue.get(approval.request_id)) ?? approval
      if (onOrphan) {
        try {
          await onOrphan(after)
        } catch (err) {
          logger.error(
            JSON.stringify({
              msg: 'autonomy.resume.on_orphan_failed',
              request_id: approval.request_id,
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }
      return { kind: 'orphaned', reason: 'session_unreachable' }
    }

    // Inject succeeded. Mark the entry resolved with the user's
    // approve/deny decision. The queue's idempotency means re-calls
    // are safe.
    const finalStatus: ResolvedStatus = input.approved ? 'approved' : 'denied'
    const reason = input.approved ? undefined : (input as { reason?: string }).reason
    await queue.markResolved(approval.request_id, finalStatus, reason)
    const after = (await queue.get(approval.request_id)) ?? approval

    return { kind: 'resumed', runId: result.runId, approval: after }
  }

  return { resumeAgentAfterApproval }
}
