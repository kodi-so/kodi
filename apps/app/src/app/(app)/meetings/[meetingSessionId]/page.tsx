'use client'

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Clock3, MessageSquare, RefreshCw, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@kodi/ui'
import { SectionIcon } from '@/components/section-icon'
import { SendHorizonal } from 'lucide-react'
import { dashedPanelClass, pageShellClass, quietTextClass, subtleTextClass } from '@/lib/brand-styles'
import { formatDate, statusLabel, statusTone, formatProviderLabel, failureReasonToMessage } from './_components/utils'
import { useMeetingDetail } from './_components/use-meeting-detail'
import { SlackSendModal } from './_components/slack-send-modal'
import { PostMeetingReview } from './_components/post-meeting-review'
import { OverviewTab } from './_components/overview-tab'
import { TranscriptTab } from './_components/transcript-tab'
import { ConfirmDialog } from '@/components/confirm-dialog'

export default function MeetingDetailsPage() {
  const m = useMeetingDetail()

  if (!m.activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a workspace to view meetings.
      </div>
    )
  }

  if (m.loading) {
    return (
      <div className={pageShellClass}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
          <Skeleton className="h-5 w-24" />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (m.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{m.error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!m.meeting) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Alert>
          <AlertDescription>
            This meeting session was not found for the current workspace.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const { meeting } = m
  const isPostMeeting =
    meeting.status === 'summarizing' ||
    meeting.status === 'completed' ||
    meeting.status === 'awaiting_approval' ||
    meeting.status === 'executing' ||
    meeting.status === 'ended'

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {/* Header */}
        <div className="space-y-4">
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Meetings
          </Link>

          <div className="rounded-2xl border border-border bg-card px-6 py-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusTone(meeting.status)}>
                    {statusLabel(meeting.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatProviderLabel(meeting.provider)}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {meeting.title ?? 'Untitled meeting'}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {m.runtimeCopy.description}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-5">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5" title="Started">
                    <Clock3 size={13} />
                    <span className="whitespace-nowrap tabular-nums">
                      {formatDate(meeting.actualStartAt ?? meeting.createdAt)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5" title="Last activity">
                    <RefreshCw size={13} />
                    <span className="whitespace-nowrap tabular-nums">
                      {formatDate(m.latestActivityAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={m.requestDeleteMeeting}
                  disabled={m.deletingMeeting}
                  className="text-muted-foreground hover:bg-transparent hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {m.failureReason && (
          <Alert variant="destructive">
            <AlertDescription>{m.failureReason}</AlertDescription>
          </Alert>
        )}
        {m.runtimeCopy.alertTitle && m.runtimeCopy.alertDescription && (
          <Alert
            variant={
              m.runtimeCopy.alertTone === 'danger'
                ? 'destructive'
                : m.runtimeCopy.alertTone === 'warning'
                  ? 'warning'
                  : 'info'
            }
          >
            <AlertDescription>
              <span className="font-medium">{m.runtimeCopy.alertTitle}: </span>
              {m.runtimeCopy.alertDescription}
            </AlertDescription>
          </Alert>
        )}

        {/* Post-meeting review */}
        {isPostMeeting && (
          <PostMeetingReview
            meeting={meeting}
            artifacts={m.artifacts}
            workItems={m.workItemsList}
            loading={m.artifactsLoading && !m.artifactsLoaded}
            retrying={m.retryingArtifacts}
            editingWorkItemId={m.editingWorkItemId}
            editWorkItemTitle={m.editWorkItemTitle}
            editWorkItemOwnerHint={m.editWorkItemOwnerHint}
            editWorkItemDueAt={m.editWorkItemDueAt}
            workItemSaving={m.workItemSaving}
            canRetry={m.activeOrg?.role === 'owner'}
            onRetry={() => void m.handleRetryArtifacts()}
            onStartEdit={m.startEditWorkItem}
            onCancelEdit={m.cancelEditWorkItem}
            onSaveEdit={(id) => void m.saveEditWorkItem(id)}
            onEditTitleChange={m.setEditWorkItemTitle}
            onEditOwnerHintChange={m.setEditWorkItemOwnerHint}
            onEditDueAtChange={m.setEditWorkItemDueAt}
            onApprove={(id) => void m.approveWorkItem(id)}
            onReject={(id) => void m.rejectWorkItem(id)}
            syncingItem={m.syncingItem}
            onSync={(id, target) => void m.syncWorkItem(id, target)}
            syncError={m.syncError}
            recapDelivering={m.recapDelivering}
            recapDeliverTarget={m.recapDeliverTarget}
            onDeliverRecap={(target, channelId) => void m.deliverRecap(target, channelId)}
            onOpenSlackModal={() => m.setSlackModalOpen(true)}
            hasSlackConnection={m.connectionStatus?.['slack'] ?? false}
            hasZoomConnection={m.connectionStatus?.['zoom'] ?? false}
            recapDeliverError={m.recapDeliverError}
            quietTextClass={quietTextClass}
            subtleTextClass={subtleTextClass}
            dashedPanelClass={dashedPanelClass}
          />
        )}

        <SlackSendModal
          open={m.slackModalOpen}
          onClose={() => m.setSlackModalOpen(false)}
          onSend={m.handleSlackSend}
          delivering={m.recapDelivering && m.recapDeliverTarget === 'slack'}
          defaultChannel={m.slackDefaultChannel}
          meetingTitle={meeting?.title ?? null}
          summaryContent={
            m.artifacts.find((a) => a.artifactType === 'summary')?.content ?? null
          }
          orgId={m.orgId}
        />

        {/* Ask Kodi sheet */}
        <Sheet open={m.askSheetOpen} onOpenChange={m.setAskSheetOpen}>
          <div />
          <SheetContent className="flex w-full max-w-xl flex-col p-0 sm:max-w-xl">
            <SheetHeader className="shrink-0">
              <div className="flex items-center gap-3">
                <SectionIcon icon={MessageSquare} />
                <SheetTitle>Ask Kodi</SheetTitle>
              </div>
            </SheetHeader>
            <div ref={m.answerScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              {m.answers.length === 0 ? (
                <div className={`${dashedPanelClass} flex h-full flex-col items-center justify-center gap-3 rounded-xl p-8 text-center`}>
                  <Sparkles size={22} className="text-muted-foreground/60" />
                  <p className={`text-sm ${quietTextClass}`}>
                    Ask anything about this meeting — decisions made, topics covered, action items, or what someone said.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {m.answers.map((answer) => (
                    <div key={answer.id} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-xl rounded-tr-[0.3rem] bg-brand-accent px-4 py-2.5">
                          <p className="text-sm font-medium text-white">{answer.question}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-accent/20 bg-brand-accent-soft text-primary">
                          <Sparkles size={13} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="rounded-xl rounded-tl-[0.3rem] border border-border bg-secondary px-4 py-3">
                            {answer.status === 'preparing' ? (
                              <div className="space-y-2">
                                <Skeleton className="h-3.5 w-full" />
                                <Skeleton className="h-3.5 w-4/5" />
                                <Skeleton className="h-3.5 w-3/5" />
                              </div>
                            ) : answer.status === 'suppressed' ? (
                              <p className={`text-sm ${quietTextClass}`}>
                                Not enough meeting context yet to answer this.
                              </p>
                            ) : answer.status === 'failed' ? (
                              <p className="text-sm text-destructive">
                                {failureReasonToMessage(answer.failureReason)}
                              </p>
                            ) : answer.answerText ? (
                              <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_li]:text-sm [&_p]:text-sm [&_p]:leading-6">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {answer.answerText}
                                </ReactMarkdown>
                              </div>
                            ) : null}
                          </div>
                          {answer.answerText && m.controls?.participationMode === 'voice_enabled' && (
                            <div className="flex items-center gap-2">
                              {answer.voiceStatus === 'speaking' ? (
                                <span className={`flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                                  <Volume2 size={12} className="animate-pulse text-brand-accent" />
                                  Speaking...
                                </span>
                              ) : answer.voiceStatus === 'delivered_to_voice' ? (
                                <span className={`flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                                  <Volume2 size={12} />
                                  Spoken
                                </span>
                              ) : answer.voiceStatus === 'voice_failed' ? (
                                <span className="flex items-center gap-1.5 text-xs text-destructive">
                                  <VolumeX size={12} />
                                  Voice failed
                                </span>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void m.handleSpeakAnswer(answer.id)}
                                  disabled={!!m.speakingAnswerId}
                                  className={`h-auto gap-1.5 rounded-full px-2.5 py-1 text-xs ${subtleTextClass}`}
                                >
                                  <Volume2 size={11} />
                                  Speak
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={m.answerBottomRef} />
                </div>
              )}
            </div>
            <div className="shrink-0 border-t px-6 py-4">
              <form onSubmit={m.handleAskKodi} className="flex gap-2">
                <Textarea
                  className="min-h-[2.5rem] resize-none rounded-xl text-sm"
                  placeholder="What has been decided so far?"
                  value={m.askQuestion}
                  onChange={(e) => m.setAskQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void m.handleAskKodi(e as unknown as React.FormEvent)
                    }
                  }}
                  disabled={m.askPending}
                  rows={2}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={m.askPending || !m.askQuestion.trim()}
                  className="h-10 w-10 shrink-0 rounded-xl"
                >
                  <SendHorizonal size={16} />
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>

        {/* Tabbed content */}
        <Tabs defaultValue="overview">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => m.setAskSheetOpen(true)}
            >
              <MessageSquare size={14} />
              Ask Kodi
              {m.answers.length > 0 && (
                <Badge variant="neutral" className="ml-1 text-[10px]">
                  {m.answers.length}
                </Badge>
              )}
            </Button>
          </div>

          <OverviewTab
            meeting={meeting}
            liveState={m.liveState}
            activeTopics={m.activeTopics}
            rollingNotes={m.rollingNotes}
            draftActions={m.draftActions}
            candidateActionItems={m.candidateActionItems}
            candidateTasks={m.candidateTasks}
            decisions={m.decisions}
            openQuestions={m.openQuestions}
            risks={m.risks}
          />

          <TranscriptTab
            speakerGroups={m.transcriptSpeakerGroups}
            collapsedSpeakers={m.collapsedSpeakers}
            setCollapsedSpeakers={m.setCollapsedSpeakers}
            scrollRef={m.transcriptScrollRef}
            bottomRef={m.transcriptBottomRef}
            atBottom={m.transcriptAtBottom}
            onScroll={m.handleTranscriptScroll}
            speakerColorMap={m.speakerColorMap}
            isEmpty={m.transcriptSpeakerGroups.length === 0}
          />
        </Tabs>

        <ConfirmDialog
          open={m.deleteConfirmOpen}
          onOpenChange={m.setDeleteConfirmOpen}
          title="Delete this meeting?"
          description="This action cannot be undone. The meeting, its transcript, and all artifacts will be permanently deleted."
          onConfirm={() => void m.executeDeleteMeeting()}
        />
      </div>
    </div>
  )
}
