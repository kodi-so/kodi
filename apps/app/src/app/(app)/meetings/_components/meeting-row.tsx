'use client'

import Link from 'next/link'
import { ArrowRight, Trash2 } from 'lucide-react'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@kodi/ui/components/tooltip'
import { encodeMeetingId } from '@/lib/meeting-id'
import {
  formatDate,
  formatProviderLabel,
  meetingSnapshot,
  statusAccentColor,
  statusLabel,
  statusTone,
  type MeetingListItem,
} from './meeting-utils'

export function MeetingRow({
  meeting,
  deletingId,
  onDelete,
}: {
  meeting: MeetingListItem[number]
  deletingId: string | null
  onDelete: (e: React.MouseEvent, meetingId: string) => void
}) {
  return (
    <div className="group flex items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-border-strong">
      {/* Status accent bar */}
      <div
        className={`w-1 shrink-0 ${statusAccentColor(meeting.status)}`}
      />

      {/* Clickable content area */}
      <Link
        href={`/meetings/${encodeMeetingId(meeting.id)}`}
        className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-secondary/50"
      >
        <Badge
          variant={statusTone(meeting.status)}
          className="shrink-0"
        >
          {statusLabel(meeting.status)}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {meeting.title ?? 'Untitled meeting'}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {meetingSnapshot(meeting)}
          </p>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span>{formatProviderLabel(meeting.provider)}</span>
          <span className="whitespace-nowrap tabular-nums">
            {formatDate(
              meeting.actualStartAt ?? meeting.createdAt
            )}
          </span>
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Link>

      {/* Delete action */}
      <div className="flex w-10 shrink-0 items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-transparent transition-colors group-hover:text-muted-foreground hover:!text-destructive hover:!bg-transparent disabled:opacity-50"
              onClick={(e) => void onDelete(e, meeting.id)}
              disabled={deletingId === meeting.id}
            >
              <Trash2 size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete meeting</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
