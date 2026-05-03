import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Plugin-owned durable approval queue (KOD-415 / M5-T8).
 *
 * Persists pending tool-call approvals so they survive plugin restarts,
 * gateway restarts, and self-update cycles. The deferred-approval
 * pattern in M5-T2 (KOD-390) requires this — a user must be able to
 * approve an action hours or days after the agent originally requested
 * it, regardless of plugin uptime.
 *
 * # Storage choice: JSONL
 *
 * The spec lists `better-sqlite3` as preferred and JSONL as an
 * acceptable fallback. We chose JSONL because:
 *
 *   1. The plugin is bundled with esbuild into a single .js file.
 *      `better-sqlite3` is a native module — its prebuilt binaries
 *      need to match the deploy target (Linux x64 / arm64 / etc.) and
 *      need to be packaged outside the bundle. That contradicts the
 *      single-file plugin shape and adds a real risk of crashes on
 *      mismatched runtimes.
 *   2. Approval volume is low. Even a busy org rarely has more than a
 *      handful of pending approvals; the file stays small.
 *   3. Append-only JSONL gives us atomic line writes (well below the
 *      OS pipe-buf threshold). The in-memory cache is the working
 *      store; the file is a write-ahead log we replay on startup.
 *
 * # File format
 *
 * One JSON object per line. Two record kinds:
 *
 *   `{ "type": "enqueue", "approval": <PendingApproval> }`
 *   `{ "type": "resolve", "request_id": "...", "status": "approved", ... }`
 *
 * Last-write-wins on replay. Malformed lines are skipped with a warn
 * (the rest of the file remains usable). If the file fails to open at
 * all, it's rotated aside (`approvals.jsonl.corrupt-<ts>`) and we start
 * fresh — the spec mandates emitting `plugin.degraded` from the caller
 * (autonomy module wires this).
 *
 * # Concurrency
 *
 * Node is single-threaded but the event loop interleaves async work.
 * All file writes flow through a serialized Promise chain so two
 * concurrent `enqueue()` calls can't interleave on disk. The
 * in-memory cache is mutated synchronously before the write so
 * subsequent `get()` calls reflect the latest intent immediately.
 */

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'orphaned'
  | 'resolved'

export type ResolvedStatus = Exclude<ApprovalStatus, 'pending' | 'resolved'>

export type PendingApproval = {
  request_id: string
  agent_id: string
  session_key: string
  tool_name: string
  args_json: string
  created_at: string
  expires_at: string
  status: ApprovalStatus
  resolved_at?: string
  resolution_reason?: string
}

type LogRecord =
  | { type: 'enqueue'; approval: PendingApproval }
  | {
      type: 'resolve'
      request_id: string
      status: ResolvedStatus
      resolved_at: string
      resolution_reason?: string
    }

export type ApprovalQueue = {
  enqueue(input: Omit<PendingApproval, 'status'>): Promise<void>
  get(request_id: string): Promise<PendingApproval | null>
  markResolved(
    request_id: string,
    status: ResolvedStatus,
    reason?: string,
  ): Promise<void>
  listPending(): Promise<PendingApproval[]>
  /** Mark every still-pending entry whose expires_at has passed as
   * `'expired'`; returns those entries (now resolved) so the caller
   * can emit `tool.approval_timeout` per result. */
  sweepExpired(): Promise<PendingApproval[]>
  /** Start the 60s sweep timer. Caller supplies the per-expiry hook
   * (typically `eventBus.emitter.emit('tool.approval_timeout', ...)`).
   * Idempotent — calling start twice is a no-op. */
  start(onExpire?: (entry: PendingApproval) => void | Promise<void>): void
  stop(): void
  /** Diagnostic: snapshot of every entry, including resolved ones. */
  snapshot(): PendingApproval[]
}

export type CreateApprovalQueueDeps = {
  /** Directory containing the JSONL file. Comes from
   * `runtime.state.resolveStateDir()`; tests pass a tmp dir. */
  stateDir: string
  /** Override `Date.now()` for tests. */
  now?: () => number
  /** Override sweep cadence for tests; default 60s per spec. */
  sweepIntervalMs?: number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
  /** Override fs (rare — used by some tests). */
  fsImpl?: typeof fs
}

const FILENAME = 'approvals.jsonl'
const DEFAULT_SWEEP_MS = 60 * 1000
const RESOLVED_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  'approved',
  'denied',
  'expired',
  'orphaned',
  'resolved',
])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseRecord(line: string): LogRecord | null {
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return null
  }
  if (!isPlainObject(json)) return null

  if (json.type === 'enqueue' && isPlainObject(json.approval)) {
    const a = json.approval
    if (
      typeof a.request_id !== 'string' ||
      typeof a.agent_id !== 'string' ||
      typeof a.session_key !== 'string' ||
      typeof a.tool_name !== 'string' ||
      typeof a.args_json !== 'string' ||
      typeof a.created_at !== 'string' ||
      typeof a.expires_at !== 'string' ||
      typeof a.status !== 'string'
    ) {
      return null
    }
    return { type: 'enqueue', approval: a as unknown as PendingApproval }
  }

  if (json.type === 'resolve') {
    if (
      typeof json.request_id !== 'string' ||
      typeof json.status !== 'string' ||
      !RESOLVED_STATUSES.has(json.status as ApprovalStatus) ||
      typeof json.resolved_at !== 'string'
    ) {
      return null
    }
    return {
      type: 'resolve',
      request_id: json.request_id,
      status: json.status as ResolvedStatus,
      resolved_at: json.resolved_at,
      resolution_reason:
        typeof json.resolution_reason === 'string'
          ? json.resolution_reason
          : undefined,
    }
  }

  return null
}

async function loadFromDisk(
  filePath: string,
  fsImpl: typeof fs,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): Promise<{ cache: Map<string, PendingApproval>; recovered: boolean }> {
  const cache = new Map<string, PendingApproval>()
  let raw: string
  try {
    raw = await fsImpl.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return { cache, recovered: false }
    }
    // Unexpected read error — rotate the file aside and start fresh.
    return rotateAndRecover(filePath, fsImpl, logger, err)
  }

  // Each line independently validated; malformed lines are skipped with
  // a warn rather than aborting the whole replay (a corrupt tail
  // shouldn't lose every prior pending approval).
  const lines = raw.split('\n')
  for (const line of lines) {
    if (line.length === 0) continue
    const rec = parseRecord(line)
    if (!rec) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.approval_queue.skip_malformed_line',
          length: line.length,
        }),
      )
      continue
    }
    applyRecord(cache, rec)
  }
  return { cache, recovered: false }
}

async function rotateAndRecover(
  filePath: string,
  fsImpl: typeof fs,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
  cause: unknown,
): Promise<{ cache: Map<string, PendingApproval>; recovered: boolean }> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const aside = `${filePath}.corrupt-${ts}`
  try {
    await fsImpl.rename(filePath, aside)
    logger.warn(
      JSON.stringify({
        msg: 'autonomy.approval_queue.rotated_corrupt',
        moved_to: aside,
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
    )
  } catch (renameErr) {
    logger.error(
      JSON.stringify({
        msg: 'autonomy.approval_queue.rotate_failed',
        error:
          renameErr instanceof Error ? renameErr.message : String(renameErr),
      }),
    )
  }
  return { cache: new Map(), recovered: true }
}

function applyRecord(
  cache: Map<string, PendingApproval>,
  rec: LogRecord,
): void {
  if (rec.type === 'enqueue') {
    // Last-write-wins on replay. Prevents dup-enqueue from creating
    // multiple in-memory entries.
    cache.set(rec.approval.request_id, rec.approval)
    return
  }
  const existing = cache.get(rec.request_id)
  if (!existing) return // resolve for unknown id; ignore on replay
  cache.set(rec.request_id, {
    ...existing,
    status: rec.status,
    resolved_at: rec.resolved_at,
    resolution_reason: rec.resolution_reason,
  })
}

export async function createApprovalQueue(
  deps: CreateApprovalQueueDeps,
): Promise<ApprovalQueue & { recovered: boolean }> {
  const fsImpl = deps.fsImpl ?? fs
  const now = deps.now ?? Date.now
  const sweepIntervalMs = deps.sweepIntervalMs ?? DEFAULT_SWEEP_MS
  const logger = deps.logger ?? console

  await fsImpl.mkdir(deps.stateDir, { recursive: true })
  const filePath = path.join(deps.stateDir, FILENAME)
  const { cache, recovered } = await loadFromDisk(filePath, fsImpl, logger)

  // Serialize all writes through a single Promise chain so concurrent
  // enqueue/markResolved calls don't interleave on disk.
  let writeQueue: Promise<void> = Promise.resolve()

  function appendRecord(rec: LogRecord): Promise<void> {
    const line = JSON.stringify(rec) + '\n'
    writeQueue = writeQueue.then(() =>
      fsImpl.appendFile(filePath, line, 'utf8'),
    )
    return writeQueue
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let onExpireCb:
    | ((entry: PendingApproval) => void | Promise<void>)
    | undefined

  async function enqueue(
    input: Omit<PendingApproval, 'status'>,
  ): Promise<void> {
    if (cache.has(input.request_id)) {
      logger.warn(
        JSON.stringify({
          msg: 'autonomy.approval_queue.duplicate_enqueue',
          request_id: input.request_id,
        }),
      )
      return
    }
    const approval: PendingApproval = { ...input, status: 'pending' }
    // Mutate the in-memory cache before the write resolves so a
    // concurrent get() in the same tick sees the new entry.
    cache.set(approval.request_id, approval)
    try {
      await appendRecord({ type: 'enqueue', approval })
    } catch (err) {
      // Disk full / permissions / etc. Per spec: fail closed. Roll the
      // in-memory entry back so the caller knows it didn't take.
      cache.delete(approval.request_id)
      throw err
    }
  }

  async function markResolved(
    request_id: string,
    status: ResolvedStatus,
    reason?: string,
  ): Promise<void> {
    const existing = cache.get(request_id)
    if (!existing) return // idempotent
    if (existing.status !== 'pending') return // already resolved; idempotent
    const resolved_at = new Date(now()).toISOString()
    const next: PendingApproval = {
      ...existing,
      status,
      resolved_at,
      resolution_reason: reason,
    }
    cache.set(request_id, next)
    try {
      await appendRecord({
        type: 'resolve',
        request_id,
        status,
        resolved_at,
        resolution_reason: reason,
      })
    } catch (err) {
      // Same fail-closed semantic: roll back in-memory and re-throw.
      cache.set(request_id, existing)
      throw err
    }
  }

  async function sweepExpired(): Promise<PendingApproval[]> {
    const cutoff = now()
    const expired: PendingApproval[] = []
    for (const entry of cache.values()) {
      if (entry.status !== 'pending') continue
      if (new Date(entry.expires_at).getTime() <= cutoff) {
        expired.push(entry)
      }
    }
    // Resolve sequentially so the JSONL log preserves order and any
    // single failure doesn't leave the cache half-resolved.
    const resolved: PendingApproval[] = []
    for (const entry of expired) {
      try {
        await markResolved(entry.request_id, 'expired')
        const after = cache.get(entry.request_id)
        if (after) resolved.push(after)
      } catch (err) {
        logger.error(
          JSON.stringify({
            msg: 'autonomy.approval_queue.sweep_resolve_failed',
            request_id: entry.request_id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
    return resolved
  }

  function start(
    onExpire?: (entry: PendingApproval) => void | Promise<void>,
  ): void {
    if (timer) return
    onExpireCb = onExpire
    timer = setInterval(() => {
      void runSweepTick()
    }, sweepIntervalMs)
    ;(timer as { unref?: () => void }).unref?.()
  }

  async function runSweepTick(): Promise<void> {
    const expired = await sweepExpired()
    if (!onExpireCb) return
    for (const entry of expired) {
      try {
        await onExpireCb(entry)
      } catch (err) {
        logger.error(
          JSON.stringify({
            msg: 'autonomy.approval_queue.on_expire_failed',
            request_id: entry.request_id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    onExpireCb = undefined
  }

  return {
    recovered,
    enqueue,
    get: async (request_id) => cache.get(request_id) ?? null,
    markResolved,
    listPending: async () =>
      Array.from(cache.values()).filter((e) => e.status === 'pending'),
    sweepExpired,
    start,
    stop,
    snapshot: () => Array.from(cache.values()),
  }
}
