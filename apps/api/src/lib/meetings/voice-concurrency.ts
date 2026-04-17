/**
 * Per-session voice lock manager.
 *
 * Enforces that only one voice response is active at a time per meeting session.
 * When a new response wants to speak, any existing in-flight response is
 * interrupted first (backpressure + overlap suppression).
 *
 * The lock is in-process only — sufficient for a single-server pilot. A
 * distributed lock (Redis, Postgres advisory lock) would be required for
 * horizontal scaling.
 */

type VoiceLockEntry = {
  answerId: string
  /** Called when a newer response needs the lock and interrupts this one. */
  interrupt: () => void
}

const sessionLocks = new Map<string, VoiceLockEntry>()

export type AcquireVoiceLockResult =
  | {
      acquired: true
      /** Release the lock when voice delivery completes or fails. */
      release: () => void
    }
  | { acquired: false; reason: string }

/**
 * Try to acquire the voice lock for `meetingSessionId` on behalf of `answerId`.
 *
 * If another answer currently holds the lock, that answer's interrupt callback
 * is invoked before granting the lock to the new caller. The caller must hold
 * the returned `release()` until playback finishes or fails.
 */
export function acquireVoiceLock(
  meetingSessionId: string,
  answerId: string,
  onInterrupted: () => void
): AcquireVoiceLockResult {
  const existing = sessionLocks.get(meetingSessionId)

  if (existing) {
    if (existing.answerId === answerId) {
      // Same answer trying to re-acquire — idempotent success.
      return {
        acquired: true,
        release: () => {
          if (sessionLocks.get(meetingSessionId)?.answerId === answerId) {
            sessionLocks.delete(meetingSessionId)
          }
        },
      }
    }

    // Interrupt the older response to make room for the newer one.
    existing.interrupt()
    sessionLocks.delete(meetingSessionId)
  }

  sessionLocks.set(meetingSessionId, {
    answerId,
    interrupt: onInterrupted,
  })

  return {
    acquired: true,
    release: () => {
      if (sessionLocks.get(meetingSessionId)?.answerId === answerId) {
        sessionLocks.delete(meetingSessionId)
      }
    },
  }
}

/**
 * Interrupt any currently active voice output for the given session.
 * Returns the answerId that was interrupted, or null if nothing was active.
 */
export function interruptActiveVoice(meetingSessionId: string): string | null {
  const existing = sessionLocks.get(meetingSessionId)
  if (!existing) return null

  existing.interrupt()
  sessionLocks.delete(meetingSessionId)
  return existing.answerId
}

/**
 * Check whether there is an active voice lock for the given session.
 */
export function hasActiveVoiceOutput(meetingSessionId: string): boolean {
  return sessionLocks.has(meetingSessionId)
}

/**
 * Get the answerId currently holding the voice lock, or null.
 */
export function getActiveVoiceAnswerId(meetingSessionId: string): string | null {
  return sessionLocks.get(meetingSessionId)?.answerId ?? null
}
