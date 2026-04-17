import type { MeetingTranscript, MeetingTranscriptSegment, MeetingTranscriptTurn } from './types'

export const SPEAKER_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
]

export type TranscriptSpeakerGroup = {
  groupId: string
  speaker: string
  startsAt: Date | string
  turns: MeetingTranscriptTurn[]
}

export function getSpeakerInitials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]![0] ?? '?').toUpperCase()
  return (
    (parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')
  ).toUpperCase()
}

function normalizeTranscriptContent(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function shouldCollapseTranscriptSegments(
  previous: MeetingTranscriptSegment,
  current: MeetingTranscriptSegment
) {
  const previousSpeaker = previous.speakerName ?? 'Unknown speaker'
  const currentSpeaker = current.speakerName ?? 'Unknown speaker'

  if (previousSpeaker !== currentSpeaker) return false
  if (previous.source !== current.source) return false
  if (!previous.isPartial && !current.isPartial) return false

  const previousCreatedAt = new Date(previous.createdAt).getTime()
  const currentCreatedAt = new Date(current.createdAt).getTime()
  if (
    Number.isNaN(previousCreatedAt) ||
    Number.isNaN(currentCreatedAt) ||
    currentCreatedAt - previousCreatedAt > 90_000
  )
    return false

  const previousContent = normalizeTranscriptContent(previous.content)
  const currentContent = normalizeTranscriptContent(current.content)

  if (!previousContent || !currentContent) return false

  return (
    previousContent === currentContent ||
    previousContent.startsWith(currentContent) ||
    currentContent.startsWith(previousContent)
  )
}

function shouldMergeTranscriptTurns(
  previous: MeetingTranscriptSegment,
  current: MeetingTranscriptSegment
) {
  const previousSpeaker = previous.speakerName ?? 'Unknown speaker'
  const currentSpeaker = current.speakerName ?? 'Unknown speaker'

  if (previousSpeaker !== currentSpeaker) return false
  if (previous.source !== current.source) return false

  const previousCreatedAt = new Date(previous.createdAt).getTime()
  const currentCreatedAt = new Date(current.createdAt).getTime()
  if (
    Number.isNaN(previousCreatedAt) ||
    Number.isNaN(currentCreatedAt) ||
    currentCreatedAt - previousCreatedAt > 90_000
  )
    return false

  return !previous.isPartial && !current.isPartial
}

function joinTranscriptContent(previous: string, current: string) {
  const previousNormalized = normalizeTranscriptContent(previous)
  const currentNormalized = normalizeTranscriptContent(current)

  if (!previousNormalized) return current.trim()
  if (!currentNormalized) return previous.trim()

  if (previousNormalized === currentNormalized) {
    return previous.length >= current.length ? previous.trim() : current.trim()
  }

  if (previousNormalized.startsWith(currentNormalized)) return previous.trim()
  if (currentNormalized.startsWith(previousNormalized)) return current.trim()

  const left = previous.trim()
  const right = current.trim()
  if (!left) return right
  if (!right) return left

  return `${left}${/\s$/.test(left) ? '' : ' '}${right}`
}

export function collapseTranscriptSegments(segments: MeetingTranscript) {
  const collapsed: MeetingTranscriptTurn[] = []

  for (const segment of segments) {
    const previous = collapsed[collapsed.length - 1]
    if (!previous || !shouldCollapseTranscriptSegments(previous, segment)) {
      collapsed.push({ ...segment, mergedSegmentCount: 1 })
      continue
    }

    const preferCurrent =
      (!segment.isPartial && previous.isPartial) ||
      segment.content.length >= previous.content.length

    if (preferCurrent) {
      collapsed[collapsed.length - 1] = {
        ...segment,
        mergedSegmentCount: previous.mergedSegmentCount,
      }
    }
  }

  const grouped: MeetingTranscriptTurn[] = []

  for (const segment of collapsed) {
    const previous = grouped[grouped.length - 1]

    if (!previous || !shouldMergeTranscriptTurns(previous, segment)) {
      grouped.push(segment)
      continue
    }

    grouped[grouped.length - 1] = {
      ...segment,
      id: previous.id,
      createdAt: previous.createdAt,
      content: joinTranscriptContent(previous.content, segment.content),
      mergedSegmentCount:
        previous.mergedSegmentCount + segment.mergedSegmentCount,
    }
  }

  return grouped
}

export function groupTranscriptBySpeaker(
  turns: MeetingTranscriptTurn[]
): TranscriptSpeakerGroup[] {
  const groups: TranscriptSpeakerGroup[] = []
  for (const turn of turns) {
    const speaker = turn.speakerName ?? 'Unknown speaker'
    const last = groups[groups.length - 1]
    if (last && last.speaker === speaker) {
      last.turns.push(turn)
    } else {
      groups.push({
        groupId: turn.id,
        speaker,
        startsAt: turn.createdAt,
        turns: [turn],
      })
    }
  }
  return groups
}
