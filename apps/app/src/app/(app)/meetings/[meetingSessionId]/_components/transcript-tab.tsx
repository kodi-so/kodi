'use client'

import type { RefObject } from 'react'
import { ChevronDown, ChevronRight, Mic2 } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TabsContent,
} from '@kodi/ui'
import { SectionIcon } from '@/components/section-icon'
import { dashedPanelClass, quietTextClass, subtleTextClass } from '@/lib/brand-styles'
import { formatTime } from './utils'
import { getSpeakerInitials, SPEAKER_COLORS, type TranscriptSpeakerGroup } from './transcript-utils'

export function TranscriptTab({
  speakerGroups,
  collapsedSpeakers,
  setCollapsedSpeakers,
  scrollRef,
  bottomRef,
  atBottom,
  onScroll,
  speakerColorMap,
  isEmpty,
}: {
  speakerGroups: TranscriptSpeakerGroup[]
  collapsedSpeakers: Set<string>
  setCollapsedSpeakers: React.Dispatch<React.SetStateAction<Set<string>>>
  scrollRef: RefObject<HTMLDivElement | null>
  bottomRef: RefObject<HTMLDivElement | null>
  atBottom: boolean
  onScroll: () => void
  speakerColorMap: RefObject<Map<string, string>>
  isEmpty: boolean
}) {
  return (
    <TabsContent value="transcript" className="mt-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SectionIcon icon={Mic2} />
            <div>
              <CardTitle className="text-lg text-foreground">
                Transcript
              </CardTitle>
              <CardDescription>
                Raw meeting language, grouped into readable speaker turns.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className={`${dashedPanelClass} rounded-xl p-5 text-sm ${quietTextClass}`}>
              Transcript lines will appear here once Kodi starts hearing the call.
            </div>
          ) : (
            <div className="relative">
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="max-h-[640px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-border bg-secondary"
              >
                {speakerGroups.map((group, groupIndex) => {
                  const color = speakerColorMap.current.get(group.speaker) ?? SPEAKER_COLORS[0]!
                  const initials = getSpeakerInitials(group.speaker)
                  const isCollapsed = collapsedSpeakers.has(group.groupId)
                  const wordCount = group.turns.reduce((n, t) => n + t.content.split(/\s+/).length, 0)

                  return (
                    <div
                      key={group.groupId}
                      className={groupIndex > 0 ? 'border-t border-border' : ''}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSpeakers((prev) => {
                            const next = new Set(prev)
                            if (next.has(group.groupId)) next.delete(group.groupId)
                            else next.add(group.groupId)
                            return next
                          })
                        }
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-secondary/80"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${color}`}>
                          {initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground">{group.speaker}</span>
                          <span className={`ml-2 text-xs ${subtleTextClass}`}>
                            {formatTime(group.startsAt)}
                          </span>
                        </span>
                        {isCollapsed && (
                          <span className={`text-xs ${subtleTextClass}`}>
                            {wordCount} words
                          </span>
                        )}
                        {isCollapsed
                          ? <ChevronRight size={14} className={subtleTextClass} />
                          : <ChevronDown size={14} className={subtleTextClass} />
                        }
                      </button>

                      {!isCollapsed && (
                        <div className="space-y-3 pb-4 pl-[3.25rem] pr-4">
                          {group.turns.map((turn) => (
                            <p
                              key={turn.id}
                              className="whitespace-pre-wrap text-sm leading-6 text-foreground"
                            >
                              {turn.content}
                              {turn.isPartial && (
                                <span className={`ml-2 text-xs ${subtleTextClass}`}>…</span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {!atBottom && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 gap-1.5 rounded-full px-3 text-xs shadow-md"
                    onClick={() => {
                      const el = scrollRef.current
                      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                    }}
                  >
                    <ChevronDown size={13} />
                    Latest
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  )
}
