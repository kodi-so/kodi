import { db } from '@kodi/db'
import { processMeetingCandidateTasks } from './openclaw-candidate-tasks'
import { processMeetingDraftActions } from './openclaw-draft-actions'
import { processMeetingRollingNotes } from './openclaw-rolling-notes'
import { processMeetingStructuredInsights } from './openclaw-structured-insights'

type TranscriptAnalysisInput = {
  orgId: string
  meetingSessionId: string
  eventId: string
  lastEventSequence: number
}

type SequencedMeetingJob = {
  meetingSessionId: string
  lastEventSequence: number
}

export function createLatestOnlyMeetingJobScheduler<TJob extends SequencedMeetingJob>(
  runner: (job: TJob) => Promise<void>
) {
  const queues = new Map<
    string,
    {
      latestInput: TJob
      promise: Promise<void>
    }
  >()

  return function schedule(job: TJob): Promise<void> {
    const existing = queues.get(job.meetingSessionId)

    if (existing) {
      if (job.lastEventSequence >= existing.latestInput.lastEventSequence) {
        existing.latestInput = job
      }
      return existing.promise
    }

    const state = {
      latestInput: job,
      promise: Promise.resolve(),
    }

    state.promise = (async () => {
      let processedSequence = -1

      while (true) {
        const current = state.latestInput
        await runner(current)
        processedSequence = current.lastEventSequence

        if (state.latestInput.lastEventSequence <= processedSequence) {
          break
        }
      }
    })().finally(() => {
      const active = queues.get(job.meetingSessionId)
      if (active === state) {
        queues.delete(job.meetingSessionId)
      }
    })

    queues.set(job.meetingSessionId, state)
    return state.promise
  }
}

function logOpenClawFailure(input: {
  label:
    | 'rolling notes'
    | 'structured insights'
    | 'candidate tasks'
    | 'draft actions'
  result: { ok: false; reason: string; error?: string } | { ok: true }
  job: TranscriptAnalysisInput
}) {
  if (!('reason' in input.result) || input.result.reason === 'missing-instance') {
    return
  }

  console.warn(`[meetings] openclaw ${input.label} failed`, {
    orgId: input.job.orgId,
    meetingSessionId: input.job.meetingSessionId,
    eventId: input.job.eventId,
    lastEventSequence: input.job.lastEventSequence,
    reason: input.result.reason,
    error: 'error' in input.result ? input.result.error ?? null : null,
  })
}

async function runTranscriptAnalysisPasses(job: TranscriptAnalysisInput) {
  const meetingSession = await db.query.meetingSessions.findFirst({
    where: (fields, { eq }) => eq(fields.id, job.meetingSessionId),
  })

  if (!meetingSession) return

  const rollingNotesResult = await processMeetingRollingNotes({
    orgId: job.orgId,
    meetingSession,
    lastEventSequence: job.lastEventSequence,
  })
  logOpenClawFailure({
    label: 'rolling notes',
    result: rollingNotesResult,
    job,
  })

  const structuredInsightsResult = await processMeetingStructuredInsights({
    orgId: job.orgId,
    meetingSession,
    lastEventSequence: job.lastEventSequence,
  })
  logOpenClawFailure({
    label: 'structured insights',
    result: structuredInsightsResult,
    job,
  })

  const candidateTasksResult = await processMeetingCandidateTasks({
    orgId: job.orgId,
    meetingSession,
    lastEventSequence: job.lastEventSequence,
  })
  logOpenClawFailure({
    label: 'candidate tasks',
    result: candidateTasksResult,
    job,
  })

  const draftActionsResult = await processMeetingDraftActions({
    orgId: job.orgId,
    meetingSession,
    lastEventSequence: job.lastEventSequence,
  })
  logOpenClawFailure({
    label: 'draft actions',
    result: draftActionsResult,
    job,
  })
}

export const scheduleMeetingTranscriptAnalysis =
  createLatestOnlyMeetingJobScheduler<TranscriptAnalysisInput>(async (job) => {
    try {
      await runTranscriptAnalysisPasses(job)
    } catch (error) {
      console.warn('[meetings] openclaw transcript analysis worker crashed', {
        orgId: job.orgId,
        meetingSessionId: job.meetingSessionId,
        eventId: job.eventId,
        lastEventSequence: job.lastEventSequence,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
