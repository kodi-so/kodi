'use client'

import { CheckCircle2, Sparkles } from 'lucide-react'
import { Badge } from '@kodi/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { TabsContent } from '@kodi/ui/components/tabs'
import { SectionIcon } from '@/components/section-icon'
import {
  dashedPanelClass,
  quietTextClass,
  subtleTextClass,
} from '@/lib/brand-styles'
import type { MeetingLiveState } from './types'

type FollowUpItem = {
  title: string
  ownerHint: string | null
  confidence: number | null
  sourceEvidence: string[]
}

type DraftAction = {
  title: string
  confidence: number | null
  sourceEvidence: string[]
  toolkitSlug: string | null
  toolkitName: string | null
  actionType: string | null
  targetSummary: string | null
  rationale: string | null
  reviewState: string | null
  approvalRequired: boolean
}

export function OverviewTab({
  meeting,
  liveState,
  activeTopics,
  rollingNotes,
  draftActions,
  candidateActionItems,
  candidateTasks,
  decisions,
  openQuestions,
  risks,
}: {
  meeting: { liveSummary?: string | null }
  liveState: MeetingLiveState
  activeTopics: string[]
  rollingNotes: string | null
  draftActions: DraftAction[]
  candidateActionItems: FollowUpItem[]
  candidateTasks: FollowUpItem[]
  decisions: string[]
  openQuestions: string[]
  risks: string[]
}) {
  return (
    <TabsContent value="overview" className="mt-6 space-y-6">
      {/* Summary card */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SectionIcon icon={Sparkles} />
            <div>
              <CardTitle className="text-lg text-foreground">
                Meeting summary
              </CardTitle>
              <CardDescription>
                The shortest useful version of the meeting so far.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTopics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeTopics.map((topic) => (
                <Badge key={topic} variant="neutral">
                  {topic}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border bg-secondary p-5">
            <p className="text-sm leading-7 text-foreground">
              {meeting.liveSummary ??
                liveState?.summary ??
                'Kodi has not produced a meeting summary yet.'}
            </p>
          </div>

          <details className="group rounded-xl border border-border bg-secondary p-5">
            <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
              Working notes
            </summary>
            <p
              className={`mt-4 whitespace-pre-wrap text-sm leading-6 ${quietTextClass}`}
            >
              {rollingNotes ??
                'Kodi will keep a tighter running set of notes here as the meeting develops.'}
            </p>
          </details>
        </CardContent>
      </Card>

      {/* Follow-up card */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Follow-up</CardTitle>
          <CardDescription>
            The handful of outputs that are actually worth acting on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <FollowUpSection
              label="Draft actions"
              items={draftActions}
              emptyText="Draft actions will appear here once Kodi can connect meeting follow-up to tools available in the workspace."
              renderItem={(draft, index) => (
                <div
                  key={`${draft.title}-${index}`}
                  className="rounded-xl border border-border bg-secondary p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {draft.title}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {(draft.toolkitName ?? draft.toolkitSlug) && (
                          <Badge variant="neutral">
                            {draft.toolkitName ?? draft.toolkitSlug}
                          </Badge>
                        )}
                        {draft.actionType && (
                          <Badge variant="neutral">
                            {draft.actionType.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {draft.approvalRequired && (
                          <Badge variant="warning">Approval required</Badge>
                        )}
                      </div>
                    </div>
                    {draft.confidence != null && (
                      <Badge variant="neutral">
                        {Math.round(draft.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                  {draft.targetSummary && (
                    <p className={`mt-3 text-sm ${quietTextClass}`}>
                      Target: {draft.targetSummary}
                    </p>
                  )}
                  {draft.rationale && (
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {draft.rationale}
                    </p>
                  )}
                  <EvidenceDetails evidence={draft.sourceEvidence} />
                </div>
              )}
            />

            <FollowUpSection
              label="Candidate action items"
              items={candidateActionItems}
              emptyText="Candidate action items will appear here once Kodi can separate concrete next actions from broader meeting notes."
              renderItem={(item, index) => (
                <FollowUpItemCard key={`${item.title}-${index}`} item={item} />
              )}
            />

            <FollowUpSection
              label="Candidate follow-up"
              items={candidateTasks}
              emptyText="Candidate follow-up will appear here when Kodi finds concrete next steps in the conversation."
              renderItem={(task, index) => (
                <FollowUpItemCard key={`${task.title}-${index}`} item={task} />
              )}
            />

            {(decisions.length > 0 ||
              openQuestions.length > 0 ||
              risks.length > 0) && (
              <div className="grid gap-3">
                {decisions.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary p-4">
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Decisions
                    </p>
                    <div className="mt-3 space-y-2">
                      {decisions.map((decision) => (
                        <div
                          key={decision}
                          className="flex items-start gap-3 text-sm text-foreground"
                        >
                          <CheckCircle2
                            size={15}
                            className="mt-0.5 text-brand-success"
                          />
                          <span>{decision}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {openQuestions.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary p-4">
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Open questions
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-foreground">
                      {openQuestions.map((q) => (
                        <p key={q}>{q}</p>
                      ))}
                    </div>
                  </div>
                )}

                {risks.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary p-4">
                    <p
                      className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}
                    >
                      Risks
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-foreground">
                      {risks.map((risk) => (
                        <p key={risk}>{risk}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}

function FollowUpSection<T>({
  label,
  items,
  emptyText,
  renderItem,
}: {
  label: string
  items: T[]
  emptyText: string
  renderItem: (item: T, index: number) => React.ReactNode
}) {
  return (
    <div>
      <p className={`text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>
        {label}
      </p>
      <div className="mt-3 space-y-3">
        {items.length > 0 ? (
          items.map((item, index) => renderItem(item, index))
        ) : (
          <div
            className={`${dashedPanelClass} rounded-xl p-4 text-sm ${quietTextClass}`}
          >
            {emptyText}
          </div>
        )}
      </div>
    </div>
  )
}

function FollowUpItemCard({ item }: { item: FollowUpItem }) {
  return (
    <div className="rounded-xl border border-border bg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{item.title}</p>
        {item.confidence != null && (
          <Badge variant="neutral">
            {Math.round(item.confidence * 100)}%
          </Badge>
        )}
      </div>
      {item.ownerHint && (
        <p className={`mt-2 text-sm ${quietTextClass}`}>
          Owner hint: {item.ownerHint}
        </p>
      )}
      <EvidenceDetails evidence={item.sourceEvidence} />
    </div>
  )
}

function EvidenceDetails({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null
  return (
    <details className="mt-3">
      <summary className={`cursor-pointer text-sm ${subtleTextClass}`}>
        Why Kodi suggested this
      </summary>
      <p className={`mt-2 text-sm leading-6 ${quietTextClass}`}>
        {evidence[0]}
      </p>
    </details>
  )
}
