'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getMeetingParticipationModeLabel } from '@kodi/db/client'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kodi/ui/components/dialog'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import { Progress } from '@kodi/ui/components/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kodi/ui/components/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kodi/ui/components/tabs'
import { Laptop, Mic, Plus, Sparkles, Users } from 'lucide-react'
import type { MeetingCopilotConfig } from './meeting-utils'

type LocalMode = 'solo' | 'room'

export type LocalSessionStartInput = {
  title?: string
  mode: LocalMode
  inputDeviceId?: string | null
  inputDeviceLabel?: string | null
  outputDeviceId?: string | null
  outputDeviceLabel?: string | null
  browserFamily?: string | null
  browserVersion?: string | null
  platform?: string | null
}

function browserSummary() {
  if (typeof navigator === 'undefined') return {}
  const userAgent = navigator.userAgent
  const match =
    userAgent.match(/(Chrome|Firefox|Safari|Edg)\/([\d.]+)/) ??
    userAgent.match(/Version\/([\d.]+).*Safari/)
  return {
    browserFamily: match?.[1] === 'Edg' ? 'Edge' : match?.[1] ?? 'Browser',
    browserVersion: match?.[2] ?? match?.[1] ?? null,
    platform: navigator.platform,
  }
}

export function StartMeetingDialog({
  open,
  onOpenChange,
  meetingUrl,
  onMeetingUrlChange,
  title,
  onTitleChange,
  isStarting,
  onStart,
  onStartLocal,
  copilotConfig,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meetingUrl: string
  onMeetingUrlChange: (value: string) => void
  title: string
  onTitleChange: (value: string) => void
  isStarting: boolean
  onStart: () => void
  onStartLocal: (input: LocalSessionStartInput) => void
  copilotConfig: MeetingCopilotConfig | null
}) {
  const [tab, setTab] = useState('link')
  const [localMode, setLocalMode] = useState<LocalMode>('solo')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>('')
  const [micLevel, setMicLevel] = useState(0)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [checkingMic, setCheckingMic] = useState(false)

  const localEnabled =
    copilotConfig?.setup.capabilities?.canStartLocalSession === true
  const settings = copilotConfig?.settings ?? null
  const selectedMic = useMemo(
    () => devices.find((device) => device.deviceId === selectedMicId) ?? null,
    [devices, selectedMicId]
  )

  // Effect 1: request permission once + enumerate devices. Runs only when the
  // local tab opens, never when selectedMicId changes — that's the meter's job.
  useEffect(() => {
    if (!open || tab !== 'local') return
    let cancelled = false
    let permissionStream: MediaStream | null = null
    async function loadDevices() {
      setCheckingMic(true)
      setDeviceError(null)
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not support microphone capture.')
        }
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const nextDevices = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === 'audioinput')
        if (cancelled) return
        setDevices(nextDevices)
        setSelectedMicId((current) => current || nextDevices[0]?.deviceId || '')
      } catch (err) {
        if (!cancelled) {
          setDeviceError(
            err instanceof Error
              ? err.message
              : 'Kodi could not access the microphone.'
          )
        }
      } finally {
        if (!cancelled) setCheckingMic(false)
        // Release the permission probe stream — the meter effect will open its own.
        permissionStream?.getTracks().forEach((track) => track.stop())
      }
    }

    void loadDevices()
    return () => {
      cancelled = true
      permissionStream?.getTracks().forEach((track) => track.stop())
    }
  }, [open, tab])

  // Effect 2: live volume meter, scoped to the selected mic. Re-runs only when
  // the user picks a different device.
  useEffect(() => {
    if (!open || tab !== 'local' || !selectedMicId) return
    let cancelled = false
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null
    let frame = 0
    async function startMeter() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMicId } },
        })
        if (cancelled) return
        const Ctx =
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext ?? AudioContext
        audioContext = new Ctx()
        // AudioContext often starts in 'suspended' state; explicitly resume so
        // the analyser actually receives samples (otherwise data stays at 128
        // and RMS reads 0 forever).
        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => {})
        }
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.5
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        // Time-domain RMS gives a real volume reading; frequency-domain average
        // skews quiet because most bins are near-silent for typical speech.
        const data = new Uint8Array(analyser.fftSize)
        const tick = () => {
          if (cancelled) return
          analyser.getByteTimeDomainData(data)
          let sumSquares = 0
          for (let i = 0; i < data.length; i += 1) {
            const normalized = (data[i] - 128) / 128
            sumSquares += normalized * normalized
          }
          const rms = Math.sqrt(sumSquares / data.length)
          // RMS for normal speech sits around 0.05-0.2; scale so that range fills the bar.
          setMicLevel(Math.min(100, Math.round(rms * 400)))
          frame = window.requestAnimationFrame(tick)
        }
        tick()
      } catch {
        // Silent — device-specific failure shouldn't block starting the session.
      }
    }
    void startMeter()
    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      void audioContext?.close().catch(() => {})
      setMicLevel(0)
    }
  }, [open, tab, selectedMicId])

  function startLocal() {
    const browser = browserSummary()
    onStartLocal({
      title: title.trim() || undefined,
      mode: localMode,
      inputDeviceId: selectedMic?.deviceId ?? null,
      inputDeviceLabel: selectedMic?.label ?? null,
      outputDeviceId: null,
      outputDeviceLabel: null,
      browserFamily: browser.browserFamily,
      browserVersion: browser.browserVersion,
      platform: browser.platform,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-soft">
          <Plus size={15} />
          New session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
          <DialogDescription>
            Start from a meeting link or capture a local conversation from this browser.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">Meeting link</TabsTrigger>
            <TabsTrigger value="local">Local</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog-meeting-url">Meeting URL</Label>
              <Input
                id="dialog-meeting-url"
                value={meetingUrl}
                onChange={(e) => onMeetingUrlChange(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-meeting-title">Title (optional)</Label>
              <Input
                id="dialog-meeting-title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Weekly product sync"
                className="h-10"
              />
            </div>
            {settings && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs">
                  {getMeetingParticipationModeLabel(settings.defaultParticipationMode)}
                </Badge>
                {settings.consentNoticeEnabled && (
                  <Badge variant="neutral" className="text-xs">
                    Disclosure on
                  </Badge>
                )}
              </div>
            )}
            <Button
              onClick={onStart}
              disabled={isStarting || meetingUrl.trim().length === 0}
              className="w-full gap-2"
            >
              <Sparkles size={15} />
              {isStarting ? 'Starting Kodi...' : 'Start meeting bot'}
            </Button>
          </TabsContent>

          <TabsContent value="local" className="mt-5 space-y-5">
            {!localEnabled && (
              <Alert variant="warning">
                <AlertDescription>
                  Local meetings are behind a rollout flag in this environment.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setLocalMode('solo')}
                className={`rounded-xl border p-4 text-left transition ${
                  localMode === 'solo'
                    ? 'border-primary bg-accent'
                    : 'border-border bg-card hover:border-border-strong'
                }`}
              >
                <Laptop size={17} className="mb-3 text-primary" />
                <p className="text-sm font-medium text-foreground">Solo thinking</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Think out loud with Kodi and turn rough ideas into next steps.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setLocalMode('room')}
                className={`rounded-xl border p-4 text-left transition ${
                  localMode === 'room'
                    ? 'border-primary bg-accent'
                    : 'border-border bg-card hover:border-border-strong'
                }`}
              >
                <Users size={17} className="mb-3 text-primary" />
                <p className="text-sm font-medium text-foreground">In-person meeting</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Capture a room conversation from one laptop microphone.
                </p>
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dialog-local-title">Title (optional)</Label>
              <Input
                id="dialog-local-title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder={localMode === 'solo' ? 'Thinking session' : 'Design review'}
                className="h-10"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div className="space-y-2">
                <Label>Microphone</Label>
                <Select value={selectedMicId} onValueChange={setSelectedMicId}>
                  <SelectTrigger>
                    <SelectValue placeholder={checkingMic ? 'Checking microphone...' : 'Select microphone'} />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mic check</Label>
                <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3">
                  <Mic
                    size={14}
                    className={
                      micLevel > 4 ? 'text-primary' : 'text-muted-foreground'
                    }
                  />
                  <Progress value={micLevel} className="h-2 bg-muted" />
                </div>
              </div>
            </div>

            {deviceError && (
              <Alert variant="destructive">
                <AlertDescription>{deviceError}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-xs leading-5 text-muted-foreground">
              Kodi needs microphone access to hear this session. The transcript,
              summary, and follow-through use the same meeting retention settings
              as the rest of your workspace. You can pause, end, or delete the
              session at any time.
            </div>

            <Button
              onClick={startLocal}
              disabled={isStarting || !localEnabled || !!deviceError || checkingMic}
              className="w-full gap-2"
            >
              <Sparkles size={15} />
              {isStarting ? 'Starting local session...' : 'Start local session'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
