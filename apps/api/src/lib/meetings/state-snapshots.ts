import { db, desc, eq, meetingStateSnapshots } from '@kodi/db'

type SaveMeetingStateSnapshotPatchInput = {
  meetingSessionId: string
  lastEventSequence: number
  patch: Partial<typeof meetingStateSnapshots.$inferInsert>
}

export async function saveMeetingStateSnapshotPatch(
  input: SaveMeetingStateSnapshotPatchInput
) {
  const latest = await db.query.meetingStateSnapshots.findFirst({
    where: (fields, { eq }) => eq(fields.meetingSessionId, input.meetingSessionId),
    orderBy: (fields, { desc }) => desc(fields.createdAt),
  })

  if (
    latest &&
    latest.lastEventSequence != null &&
    latest.lastEventSequence === input.lastEventSequence
  ) {
    const [updated] = await db
      .update(meetingStateSnapshots)
      .set({
        summary:
          input.patch.summary === undefined ? latest.summary : input.patch.summary,
        rollingNotes:
          input.patch.rollingNotes === undefined
            ? latest.rollingNotes
            : input.patch.rollingNotes,
        activeTopics:
          input.patch.activeTopics === undefined
            ? latest.activeTopics
            : input.patch.activeTopics,
        decisions:
          input.patch.decisions === undefined
            ? latest.decisions
            : input.patch.decisions,
        openQuestions:
          input.patch.openQuestions === undefined
            ? latest.openQuestions
            : input.patch.openQuestions,
        risks: input.patch.risks === undefined ? latest.risks : input.patch.risks,
        candidateTasks:
          input.patch.candidateTasks === undefined
            ? latest.candidateTasks
            : input.patch.candidateTasks,
        candidateActionItems:
          input.patch.candidateActionItems === undefined
            ? latest.candidateActionItems
            : input.patch.candidateActionItems,
        draftActions:
          input.patch.draftActions === undefined
            ? latest.draftActions
            : input.patch.draftActions,
        lastEventSequence: input.lastEventSequence,
        lastProcessedAt:
          input.patch.lastProcessedAt === undefined
            ? latest.lastProcessedAt
            : input.patch.lastProcessedAt,
        lastClassifiedAt:
          input.patch.lastClassifiedAt === undefined
            ? latest.lastClassifiedAt
            : input.patch.lastClassifiedAt,
      })
      .where(eq(meetingStateSnapshots.id, latest.id))
      .returning()

    return updated
  }

  const [created] = await db
    .insert(meetingStateSnapshots)
    .values({
      meetingSessionId: input.meetingSessionId,
      summary: input.patch.summary ?? latest?.summary ?? null,
      rollingNotes: input.patch.rollingNotes ?? latest?.rollingNotes ?? null,
      activeTopics: input.patch.activeTopics ?? latest?.activeTopics ?? null,
      decisions: input.patch.decisions ?? latest?.decisions ?? null,
      openQuestions: input.patch.openQuestions ?? latest?.openQuestions ?? null,
      risks: input.patch.risks ?? latest?.risks ?? null,
      candidateTasks: input.patch.candidateTasks ?? latest?.candidateTasks ?? null,
      candidateActionItems:
        input.patch.candidateActionItems ?? latest?.candidateActionItems ?? null,
      draftActions: input.patch.draftActions ?? latest?.draftActions ?? null,
      lastEventSequence: input.lastEventSequence,
      lastProcessedAt: input.patch.lastProcessedAt ?? latest?.lastProcessedAt ?? null,
      lastClassifiedAt:
        input.patch.lastClassifiedAt ?? latest?.lastClassifiedAt ?? null,
    })
    .returning()

  return created
}
