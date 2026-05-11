'use client'

import { Mic, MicOff } from 'lucide-react'

export type CapturePhase =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'hearing'
  | 'transcribing'

const PHASE_LABEL: Record<CapturePhase, string> = {
  idle: 'Not capturing',
  initializing: 'Connecting',
  listening: 'Listening',
  hearing: 'Listening',
  transcribing: 'Transcribing',
}

const NUM_BARS = 12

/**
 * Compact single-row status indicator for an active local capture session.
 * Renders inside the transcript card header so it doesn't compete with the
 * transcript for attention. Three pieces of information:
 *
 *   • Phase label    — what the system is doing right now
 *   • Audio meter    — proof the mic is reaching the page
 *   • Phrase count   — how much has been captured so far
 *
 * Plus an error state that takes over the row when capture fails.
 */
export function LiveCaptureBanner({
  phase,
  audioLevel,
  transcriptCount,
  errorMessage,
}: {
  phase: CapturePhase
  audioLevel: number
  transcriptCount: number
  errorMessage: string | null
}) {
  const isErrored = !!errorMessage
  const isActive = !isErrored && phase !== 'idle'

  if (isErrored) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
        <MicOff size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{errorMessage}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <Mic
          size={14}
          className={isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}
          aria-hidden
        />
        {isActive && (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        )}
        <span className="text-sm font-medium text-foreground">
          {PHASE_LABEL[phase]}
        </span>
      </div>

      <LevelMeter level={audioLevel} active={isActive} />

      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {transcriptCount} {transcriptCount === 1 ? 'phrase' : 'phrases'}
      </span>
    </div>
  )
}

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div
      className="flex h-4 flex-1 items-end gap-[2px]"
      role="meter"
      aria-label="Microphone input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={level}
    >
      {Array.from({ length: NUM_BARS }).map((_, i) => {
        const threshold = ((i + 1) / NUM_BARS) * 100
        const lit = active && level >= threshold
        return (
          <span
            key={i}
            className={
              'flex-1 rounded-sm transition-[height,background-color] duration-75 ease-out ' +
              (lit
                ? 'bg-emerald-500'
                : 'bg-zinc-200 dark:bg-zinc-700')
            }
            style={{ height: `${30 + ((i + 1) / NUM_BARS) * 70}%` }}
          />
        )
      })}
    </div>
  )
}
