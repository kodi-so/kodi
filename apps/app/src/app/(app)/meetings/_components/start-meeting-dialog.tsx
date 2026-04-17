'use client'

import { getMeetingParticipationModeLabel } from '@kodi/db/client'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@kodi/ui'
import { Plus, Sparkles } from 'lucide-react'
import type { MeetingCopilotConfig } from './meeting-utils'

export function StartMeetingDialog({
  open,
  onOpenChange,
  meetingUrl,
  onMeetingUrlChange,
  title,
  onTitleChange,
  isStarting,
  onStart,
  copilotSettings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meetingUrl: string
  onMeetingUrlChange: (value: string) => void
  title: string
  onTitleChange: (value: string) => void
  isStarting: boolean
  onStart: () => void
  copilotSettings: MeetingCopilotConfig['settings'] | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-soft">
          <Plus size={15} />
          Start meeting
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a meeting</DialogTitle>
          <DialogDescription>
            Paste a Google Meet or Zoom link. Kodi will join, capture the
            transcript, and generate a summary.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 space-y-4">
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
            <Label htmlFor="dialog-meeting-title">
              Title (optional)
            </Label>
            <Input
              id="dialog-meeting-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Weekly product sync"
              className="h-10"
            />
          </div>
          {copilotSettings && (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">
                {getMeetingParticipationModeLabel(
                  copilotSettings.defaultParticipationMode
                )}
              </Badge>
              {copilotSettings.consentNoticeEnabled && (
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
