import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { EventEnvelope } from '@kodi/shared/events'
import { KodiClientError, type KodiClient } from '../bridge-core/kodi-client'
import { EVENTS_INGEST_PATH } from './emitter'

/**
 * Disk-backed outbox for events that failed to deliver to Kodi.
 *
 * One JSONL file per instance — `<outboxPath>/pending.jsonl`. Each line is
 * a serialized canonical `EventEnvelope`. Operations:
 *
 *   - `push(envelope)`  — append a line. If the file is past the size cap,
 *                         rotate it out of the way before appending.
 *   - `flush()`         — read every pending line, attempt re-delivery via
 *                         the KodiClient (which already retries 5xx with
 *                         backoff), drop the lines that succeeded, leave
 *                         the rest. Corrupt JSON is skipped + logged so a
 *                         single bad entry can't poison the queue.
 *   - `start()` / `stop()` — flush on first tick, then on a 30s timer.
 *
 * Single-process plugin → a Promise-chain mutex is enough to serialize
 * push/flush against each other. Disk-full (ENOSPC) flips a `disabled`
 * flag so we stop hammering the failing FS; `onDegraded` fires once so
 * the event-bus can emit `plugin.degraded` over the network path.
 *
 * Rotation is a backstop, not a delivery strategy: if events keep
 * failing past the size cap we move the file aside (`pending.<ts>.jsonl`)
 * and start fresh. The archived file stays on disk for ops to replay
 * manually; this plugin does not auto-retry rotated files (M8 may).
 */

export const DEFAULT_FLUSH_INTERVAL_MS = 30_000
export const DEFAULT_MAX_FILE_BYTES = 10_000_000

export type DiskOutboxDeps = {
  /** Directory holding `pending.jsonl`. Created on first write. */
  outboxPath: string
  kodiClient: KodiClient
  flushIntervalMs?: number
  maxFileBytes?: number
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
  /**
   * Fired once on the first ENOSPC (disk full). The event-bus wires this
   * to `emitter.emit('plugin.degraded', ...)` so Kodi sees the signal
   * over the network path even when the disk path is unusable.
   */
  onDegraded?: (reason: string) => void
  now?: () => number
  setIntervalImpl?: typeof setInterval
  clearIntervalImpl?: typeof clearInterval
}

export type FlushResult = {
  flushed: number
  remaining: number
  corrupt: number
}

export type DiskOutbox = {
  push: (envelope: EventEnvelope) => Promise<void>
  flush: () => Promise<FlushResult>
  start: () => Promise<void>
  stop: () => void
  /** Approximate bytes in `pending.jsonl`; 0 if file does not exist. */
  size: () => Promise<number>
  /** Path to the active pending file (for tests / diagnostics). */
  pendingFile: () => string
}

function pendingPath(outboxPath: string): string {
  return path.join(outboxPath, 'pending.jsonl')
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function fileSize(file: string): Promise<number> {
  try {
    const stat = await fs.stat(file)
    return stat.size
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw err
  }
}

function isDiskFull(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOSPC'
}

export function createDiskOutbox(deps: DiskOutboxDeps): DiskOutbox {
  const {
    outboxPath,
    kodiClient,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    logger = console,
    onDegraded,
    now = Date.now,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = deps

  const file = pendingPath(outboxPath)
  let timer: ReturnType<typeof setInterval> | null = null
  let disabledByDisk = false
  let degradedFired = false

  /**
   * Mutex chain — every public op awaits the previous one's tail. Keeps
   * push and flush from interleaving rewrites of pending.jsonl.
   */
  let mutex: Promise<unknown> = Promise.resolve()
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = mutex.then(fn, fn)
    mutex = next.catch(() => undefined)
    return next
  }

  function reportDegraded(reason: string): void {
    if (degradedFired) return
    degradedFired = true
    logger.warn(JSON.stringify({ msg: 'outbox.degraded', reason }))
    onDegraded?.(reason)
  }

  async function rotate(): Promise<void> {
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-')
    const archive = path.join(outboxPath, `pending.${stamp}.jsonl`)
    try {
      await fs.rename(file, archive)
      logger.warn(
        JSON.stringify({ msg: 'outbox.rotated', archive, reason: 'size cap' }),
      )
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async function push(envelope: EventEnvelope): Promise<void> {
    if (disabledByDisk) {
      logger.warn(
        JSON.stringify({ msg: 'outbox.push.dropped', reason: 'disk full' }),
      )
      return
    }
    return withLock(async () => {
      try {
        await ensureDir(outboxPath)
        const sizeBefore = await fileSize(file)
        if (sizeBefore >= maxFileBytes) {
          await rotate()
        }
        const line = JSON.stringify(envelope) + '\n'
        await fs.appendFile(file, line, { encoding: 'utf8' })
      } catch (err) {
        if (isDiskFull(err)) {
          disabledByDisk = true
          reportDegraded('outbox disk full')
          return
        }
        logger.error(
          JSON.stringify({
            msg: 'outbox.push.failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    })
  }

  async function flush(): Promise<FlushResult> {
    return withLock(async () => {
      let raw: string
      try {
        raw = await fs.readFile(file, 'utf8')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return { flushed: 0, remaining: 0, corrupt: 0 }
        }
        throw err
      }

      // Split + drop the trailing empty entry from the final '\n'.
      const lines = raw.split('\n')
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

      let flushed = 0
      let corrupt = 0
      const remainingLines: string[] = []

      for (const line of lines) {
        if (line.length === 0) continue
        let envelope: EventEnvelope
        try {
          envelope = JSON.parse(line) as EventEnvelope
        } catch {
          corrupt += 1
          logger.warn(
            JSON.stringify({ msg: 'outbox.flush.corrupt_line', preview: line.slice(0, 80) }),
          )
          continue
        }
        try {
          await kodiClient.signedFetch(EVENTS_INGEST_PATH, {
            method: 'POST',
            body: envelope as unknown as Record<string, unknown>,
          })
          flushed += 1
        } catch (err) {
          // 401 means the secret is wrong; retrying won't help — log and
          // drop. Anything else: keep the line for the next flush.
          if (err instanceof KodiClientError && err.status === 401) {
            corrupt += 1
            logger.warn(
              JSON.stringify({
                msg: 'outbox.flush.auth_failed',
                kind: envelope?.event?.kind,
              }),
            )
            continue
          }
          remainingLines.push(line)
        }
      }

      try {
        if (remainingLines.length === 0) {
          await fs.rm(file, { force: true })
        } else {
          await fs.writeFile(file, remainingLines.join('\n') + '\n', { encoding: 'utf8' })
        }
      } catch (err) {
        if (isDiskFull(err)) {
          disabledByDisk = true
          reportDegraded('outbox disk full during flush rewrite')
        } else {
          logger.error(
            JSON.stringify({
              msg: 'outbox.flush.rewrite_failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }

      return { flushed, remaining: remainingLines.length, corrupt }
    })
  }

  async function start(): Promise<void> {
    // Best-effort startup flush per ticket. Errors don't propagate — a
    // boot-time flush failure should not break the plugin load.
    try {
      await flush()
    } catch (err) {
      logger.error(
        JSON.stringify({
          msg: 'outbox.start.flush_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
    if (!timer) {
      timer = setIntervalImpl(() => {
        void flush().catch((err) =>
          logger.error(
            JSON.stringify({
              msg: 'outbox.timer.flush_failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        )
      }, flushIntervalMs)
      // Don't keep the event loop alive just for this timer.
      const t = timer as { unref?: () => void }
      t.unref?.()
    }
  }

  function stop(): void {
    if (timer) {
      clearIntervalImpl(timer)
      timer = null
    }
  }

  return {
    push,
    flush,
    start,
    stop,
    size: () => fileSize(file),
    pendingFile: () => file,
  }
}
