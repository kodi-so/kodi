import type { MeetingTranscriptEvent } from './events'

export type LocalTranscriptionSpeaker = {
  id?: string | null
  name?: string | null
}

export type LocalTranscriptionResult = {
  id?: string | null
  text: string
  isPartial?: boolean
  confidence?: number | null
  speaker?: LocalTranscriptionSpeaker | null
  startedAtMs?: number | null
  endedAtMs?: number | null
  occurredAt?: Date
}

export interface LocalStreamingTranscriptionAdapter {
  readonly provider: string
  normalizeResult(input: {
    meetingSessionId: string
    mode: 'solo' | 'room'
    hostParticipantId: string
    hostDisplayName: string
    result: LocalTranscriptionResult
  }): MeetingTranscriptEvent | null
}

export class BrowserSpeechRecognitionAdapter
  implements LocalStreamingTranscriptionAdapter
{
  readonly provider = 'browser-speech-recognition'

  normalizeResult(input: {
    meetingSessionId: string
    mode: 'solo' | 'room'
    hostParticipantId: string
    hostDisplayName: string
    result: LocalTranscriptionResult
  }): MeetingTranscriptEvent | null {
    const content = input.result.text.trim()
    if (!content) return null

    const speakerId =
      input.mode === 'solo'
        ? input.hostParticipantId
        : input.result.speaker?.id?.trim() || 'local-room'
    const speakerName =
      input.mode === 'solo'
        ? input.hostDisplayName
        : input.result.speaker?.name?.trim() || 'Room'

    return {
      kind: 'transcript',
      provider: 'local',
      occurredAt: input.result.occurredAt ?? new Date(),
      transcriptEventId:
        input.result.id ??
        `${input.meetingSessionId}:${Date.now()}:${content.slice(0, 24)}`,
      session: {
        internalMeetingSessionId: input.meetingSessionId,
      },
      transcript: {
        content,
        speaker: {
          providerParticipantId: speakerId,
          displayName: speakerName,
        },
        startOffsetMs: input.result.startedAtMs ?? null,
        endOffsetMs: input.result.endedAtMs ?? null,
        confidence: input.result.confidence ?? null,
        isPartial: input.result.isPartial ?? false,
      },
      metadata: {
        localTranscriptionProvider: this.provider,
        localMode: input.mode,
      },
    }
  }
}

export const browserSpeechRecognitionAdapter =
  new BrowserSpeechRecognitionAdapter()
