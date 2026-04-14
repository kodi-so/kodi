import { describe, expect, it } from 'bun:test'
import { createLatestOnlyMeetingJobScheduler } from './openclaw-background'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('createLatestOnlyMeetingJobScheduler', () => {
  it('coalesces overlapping work to the latest transcript sequence per meeting', async () => {
    const gate = deferred()
    const seen: number[] = []

    const schedule = createLatestOnlyMeetingJobScheduler(async (job: {
      meetingSessionId: string
      lastEventSequence: number
    }) => {
      seen.push(job.lastEventSequence)
      if (job.lastEventSequence === 1) {
        await gate.promise
      }
    })

    const run1 = schedule({ meetingSessionId: 'meeting-1', lastEventSequence: 1 })
    const run2 = schedule({ meetingSessionId: 'meeting-1', lastEventSequence: 2 })
    const run3 = schedule({ meetingSessionId: 'meeting-1', lastEventSequence: 3 })

    gate.resolve()
    await Promise.all([run1, run2, run3])

    expect(seen).toEqual([1, 3])
  })

  it('keeps separate meetings independent', async () => {
    const seen: string[] = []

    const schedule = createLatestOnlyMeetingJobScheduler(async (job: {
      meetingSessionId: string
      lastEventSequence: number
    }) => {
      seen.push(`${job.meetingSessionId}:${job.lastEventSequence}`)
    })

    await Promise.all([
      schedule({ meetingSessionId: 'meeting-1', lastEventSequence: 1 }),
      schedule({ meetingSessionId: 'meeting-2', lastEventSequence: 1 }),
    ])

    expect(seen.sort()).toEqual(['meeting-1:1', 'meeting-2:1'])
  })
})
