'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { RefreshCcw } from 'lucide-react'
import { deriveMeetingBotIdentity } from '@kodi/db/client'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { useAsyncResource } from '@/lib/use-async-resource'
import { pageShellClass } from '@/lib/brand-styles'
import { encodeMeetingId } from '@/lib/meeting-id'
import type {
  MeetingCopilotConfig,
  MeetingListItem,
} from './_components/meeting-utils'
import { MeetingRow } from './_components/meeting-row'
import { StartMeetingDialog } from './_components/start-meeting-dialog'
import type { LocalSessionStartInput } from './_components/start-meeting-dialog'
import { BotIdentityButton } from './_components/bot-identity-bar'
import { EmptyState } from './_components/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'

type MeetingsData = {
  meetings: MeetingListItem
  nextCursor: string | null
  copilotConfig: MeetingCopilotConfig | null
}

export default function MeetingsPage() {
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [loadingMore, setLoadingMore] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [isStarting, startStartTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const orgId = activeOrg?.orgId ?? null

  const {
    data,
    error: fetchError,
    isInitialLoading: loading,
    isRefreshing,
    refresh: refetchMeetings,
    mutate,
  } = useAsyncResource<MeetingsData>(
    async () => {
      const [listResult, nextCopilotConfig] = await Promise.all([
        trpc.meeting.list.query({ orgId: orgId!, limit: 10 }),
        trpc.meeting.getCopilotSettings.query({ orgId: orgId! }),
      ])
      return {
        meetings: listResult.items,
        nextCursor: listResult.nextCursor,
        copilotConfig: nextCopilotConfig,
      }
    },
    [orgId],
    { enabled: orgId !== null }
  )

  const meetings = data?.meetings ?? ([] as MeetingListItem)
  const nextCursor = data?.nextCursor ?? null
  const copilotConfig = data?.copilotConfig ?? null
  const error = mutationError ?? fetchError
  const setError = setMutationError

  function handleDeleteClick(e: React.MouseEvent, meetingId: string) {
    e.preventDefault()
    e.stopPropagation()
    setDeleteConfirmId(meetingId)
  }

  async function executeDelete() {
    if (!deleteConfirmId || deletingId || !activeOrg) return
    const meetingId = deleteConfirmId
    setDeleteConfirmId(null)
    setDeletingId(meetingId)
    try {
      await trpc.meeting.delete.mutate({
        orgId: activeOrg.orgId,
        meetingSessionId: meetingId,
      })
      mutate((current) =>
        current
          ? { ...current, meetings: current.meetings.filter((m) => m.id !== meetingId) }
          : current
      )
    } catch {
      // silently ignore — meeting may already be gone
    } finally {
      setDeletingId(null)
    }
  }

  async function refresh() {
    setError(null)
    await refetchMeetings()
  }

  async function loadMore() {
    if (!activeOrg || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const listResult = await trpc.meeting.list.query({
        orgId: activeOrg.orgId,
        limit: 20,
        cursor: nextCursor,
      })
      mutate((current) =>
        current
          ? {
              ...current,
              meetings: [...current.meetings, ...listResult.items] as MeetingListItem,
              nextCursor: listResult.nextCursor,
            }
          : current
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more meetings.'
      )
    } finally {
      setLoadingMore(false)
    }
  }

  async function startMeeting() {
    if (!activeOrg) return

    startStartTransition(() => {
      void (async () => {
        try {
          const result = await trpc.meeting.joinByUrl.mutate({
            orgId: activeOrg.orgId,
            meetingUrl: meetingUrl.trim(),
            title: title.trim() || undefined,
          })

          setError(null)
          setMeetingUrl('')
          setTitle('')
          setDialogOpen(false)
          router.push(`/meetings/${encodeMeetingId(result.meetingSessionId)}`)
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to start the meeting bot.'
          )
        }
      })()
    })
  }

  async function startLocalSession(input: LocalSessionStartInput) {
    if (!activeOrg) return

    startStartTransition(() => {
      void (async () => {
        try {
          const result = await trpc.meeting.startLocalSession.mutate({
            orgId: activeOrg.orgId,
            ...input,
            participationMode:
              workspaceCopilotSettings?.defaultParticipationMode ?? undefined,
          })

          window.sessionStorage.setItem(
            `kodi.localMeeting.${result.meetingSessionId}.ingestToken`,
            result.ingestToken
          )
          setError(null)
          setTitle('')
          setDialogOpen(false)
          router.push(`/meetings/${encodeMeetingId(result.meetingSessionId)}`)
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to start the local session.'
          )
        }
      })()
    })
  }

  const liveCount = useMemo(
    () =>
      meetings.filter((meeting) =>
        [
          'preparing',
          'joining',
          'admitted',
          'listening',
          'processing',
          'summarizing',
        ].includes(meeting.status)
      ).length,
    [meetings]
  )

  const workspaceCopilotSettings = copilotConfig?.settings ?? null
  const meetingBotIdentity = useMemo(
    () =>
      activeOrg && workspaceCopilotSettings
        ? deriveMeetingBotIdentity({
            orgName: activeOrg.orgName,
            orgSlug: activeOrg.orgSlug,
            displayNameOverride: workspaceCopilotSettings.botDisplayName,
          })
        : null,
    [activeOrg, workspaceCopilotSettings]
  )

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a workspace to work with meetings.
      </div>
    )
  }

  const workspaceMeetingBotIdentity =
    meetingBotIdentity ??
    deriveMeetingBotIdentity({
      orgName: activeOrg.orgName,
      orgSlug: activeOrg.orgSlug,
    })

  return (
    <div className={pageShellClass}>
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Page header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Meetings
            </h1>
            <p className="text-sm text-muted-foreground">
              Summaries, transcripts, and follow-ups from every conversation
              Kodi has joined.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BotIdentityButton
              displayName={workspaceMeetingBotIdentity.displayName}
              inviteEmail={workspaceMeetingBotIdentity.inviteEmail}
              onError={setError}
            />
            <Button
              onClick={() => void refresh()}
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              className="gap-1.5 text-muted-foreground"
            >
              <RefreshCcw
                size={14}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
            <StartMeetingDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              meetingUrl={meetingUrl}
              onMeetingUrlChange={setMeetingUrl}
              title={title}
              onTitleChange={setTitle}
              isStarting={isStarting}
              onStart={() => void startMeeting()}
              onStartLocal={(input) => void startLocalSession(input)}
              copilotConfig={copilotConfig}
            />
          </div>
        </div>

        {/* Live indicator */}
        {liveCount > 0 && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-success-soft px-3.5 py-1.5 text-xs font-medium text-brand-success ring-1 ring-brand-success/15">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-success" />
            {liveCount} session{liveCount > 1 ? 's' : ''} live
          </div>
        )}

        {/* Meetings list */}
        <div className="mt-8">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
                >
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <EmptyState onStartMeeting={() => setDialogOpen(true)} />
          ) : (
            <div className="space-y-2">
              {meetings.map((meeting) => (
                <MeetingRow
                  key={meeting.id}
                  meeting={meeting}
                  deletingId={deletingId}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>
          )}

          {!loading && meetings.length > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
              </p>
              {nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="gap-1.5"
                >
                  {loadingMore && (
                    <RefreshCcw size={14} className="animate-spin" />
                  )}
                  {loadingMore ? 'Loading...' : 'Load more'}
                </Button>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={deleteConfirmId !== null}
          onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
          title="Delete this meeting?"
          description="This action cannot be undone. The meeting, its transcript, and all artifacts will be permanently deleted."
          onConfirm={() => void executeDelete()}
        />
      </div>
    </div>
  )
}
