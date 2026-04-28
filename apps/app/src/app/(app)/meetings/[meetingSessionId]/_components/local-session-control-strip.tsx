'use client'

import { useMemo } from 'react'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Mic, Pause, Play, Square, VolumeX, Wifi } from 'lucide-react'

type LocalSession = {
  mode: 'solo' | 'room'
  captureState: string
  transcriptionState: string
  inputDeviceLabel: string | null
  createdAt: Date | string
  pausedAt: Date | string | null
  lastHeartbeatAt: Date | string | null
}

function elapsedLabel(startedAt: Date | string) {
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '0m'
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60_000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function stateCopy(captureState: string) {
  switch (captureState) {
    case 'capturing':
      return 'Kodi is listening'
    case 'paused':
      return 'Paused'
    case 'reconnecting':
      return 'Reconnecting'
    case 'ended':
      return 'Ended'
    case 'failed':
      return 'Needs attention'
    default:
      return 'Ready'
  }
}

export function LocalSessionControlStrip({
  localSession,
  captureActive,
  captureError,
  onPause,
  onResume,
  onEnd,
  onAsk,
  onStopSpeaking,
}: {
  localSession: LocalSession
  captureActive: boolean
  captureError: string | null
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onAsk: () => void
  onStopSpeaking: () => void
}) {
  const elapsed = useMemo(() => elapsedLabel(localSession.createdAt), [
    localSession.createdAt,
  ])
  const isPaused = localSession.captureState === 'paused'
  const isEnded = ['ended', 'failed'].includes(localSession.captureState)

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">
            {localSession.mode === 'solo' ? 'Solo thinking' : 'Local room'}
          </Badge>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Mic size={14} className={captureActive ? 'text-brand-success' : 'text-muted-foreground'} />
            {stateCopy(localSession.captureState)}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {elapsed}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wifi size={13} />
            {localSession.transcriptionState.replace(/_/g, ' ')}
          </span>
          <span className="max-w-[220px] truncate text-xs text-muted-foreground">
            {localSession.inputDeviceLabel || 'Default microphone'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPaused ? (
            <Button variant="outline" size="sm" onClick={onResume} disabled={isEnded} className="gap-1.5">
              <Play size={14} />
              Resume
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onPause} disabled={isEnded} className="gap-1.5">
              <Pause size={14} />
              Pause
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onAsk}>
            Ask Kodi
          </Button>
          <Button variant="ghost" size="sm" onClick={onStopSpeaking} className="gap-1.5 text-muted-foreground">
            <VolumeX size={14} />
            Stop speaking
          </Button>
          <Button variant="destructive" size="sm" onClick={onEnd} disabled={isEnded} className="gap-1.5">
            <Square size={13} />
            End session
          </Button>
        </div>
      </div>
      {captureError && (
        <p className="mt-3 text-xs text-destructive">{captureError}</p>
      )}
    </div>
  )
}
