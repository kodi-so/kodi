'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

export type CapturePhase =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'hearing'
  | 'transcribing'

const PHASE_COPY: Record<CapturePhase, { label: string; tone: 'neutral' | 'active' | 'live' }> = {
  idle: { label: 'Not capturing', tone: 'neutral' },
  initializing: { label: 'Initializing microphone…', tone: 'neutral' },
  listening: { label: 'Listening for speech…', tone: 'active' },
  hearing: { label: 'Hearing you…', tone: 'live' },
  transcribing: { label: 'Transcribing in real time', tone: 'live' },
}

const NUM_BARS = 24

export function LiveCaptureBanner({
  phase,
  audioLevel,
  lastSpeechAt,
  transcriptCount,
  interimText,
  errorMessage,
}: {
  phase: CapturePhase
  audioLevel: number
  lastSpeechAt: Date | null
  transcriptCount: number
  interimText: string
  errorMessage: string | null
}) {
  const copy = PHASE_COPY[phase]
  const isErrored = !!errorMessage
  const isLive = !isErrored && (copy.tone === 'live' || copy.tone === 'active')

  const now = useNow(isLive ? 1000 : null)
  const lastSpeechAgo = lastSpeechAt
    ? formatRelativeSeconds(Math.round((now - lastSpeechAt.getTime()) / 1000))
    : null

  return (
    <div
      className={
        'mb-4 rounded-xl border px-4 py-3 transition-colors ' +
        (isErrored
          ? 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30'
          : isLive
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
            : 'border-border bg-card')
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={
            'flex h-9 w-9 items-center justify-center rounded-full ' +
            (isErrored
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
              : isLive
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground')
          }
          aria-hidden
        >
          {isErrored ? <MicOff size={16} /> : <Mic size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <span
              className={
                'text-sm font-medium ' +
                (isErrored
                  ? 'text-rose-700 dark:text-rose-300'
                  : isLive
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : 'text-foreground')
              }
            >
              {isErrored ? errorMessage : copy.label}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{transcriptCount} phrase{transcriptCount === 1 ? '' : 's'} captured</span>
            {lastSpeechAgo && <span aria-hidden>·</span>}
            {lastSpeechAgo && <span>Last speech {lastSpeechAgo}</span>}
          </div>
        </div>

        <LevelMeter level={audioLevel} disabled={isErrored} />
      </div>

      {interimText && !isErrored && (
        <p className="mt-3 text-sm italic leading-6 text-muted-foreground">
          “{interimText}”
        </p>
      )}
    </div>
  )
}

function LevelMeter({ level, disabled }: { level: number; disabled: boolean }) {
  return (
    <div
      className="flex h-8 items-end gap-[2px]"
      role="meter"
      aria-label="Microphone input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={level}
    >
      {Array.from({ length: NUM_BARS }).map((_, i) => {
        const threshold = ((i + 1) / NUM_BARS) * 100
        const active = !disabled && level >= threshold
        return (
          <span
            key={i}
            className={
              'w-[3px] rounded-sm transition-[height,background-color] duration-75 ease-out ' +
              (active
                ? i > NUM_BARS * 0.8
                  ? 'bg-rose-500'
                  : i > NUM_BARS * 0.55
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                : 'bg-zinc-200 dark:bg-zinc-700')
            }
            style={{ height: `${20 + ((i + 1) / NUM_BARS) * 80}%` }}
          />
        )
      })}
    </div>
  )
}

function useNow(intervalMs: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!intervalMs) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function formatRelativeSeconds(seconds: number): string {
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
