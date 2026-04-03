import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'

export const meetingRouter = router({
  list: memberProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.meetingSessions.findMany({
        where: (fields, { eq }) => eq(fields.orgId, ctx.org.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
        limit: input.limit,
        columns: {
          id: true,
          provider: true,
          status: true,
          title: true,
          actualStartAt: true,
          endedAt: true,
          createdAt: true,
        },
      })
    }),

  getById: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
      })
    }),

  getConsole: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        transcriptLimit: z.number().int().min(1).max(500).default(200),
        eventLimit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (!meeting) return null

      const [participants, transcript, liveState, events] = await Promise.all([
        ctx.db.query.meetingParticipants.findMany({
          where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
          orderBy: (fields, { desc }) => desc(fields.createdAt),
        }),
        ctx.db.query.transcriptSegments.findMany({
          where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
          orderBy: (fields, { desc }) => desc(fields.createdAt),
          limit: input.transcriptLimit,
        }),
        ctx.db.query.meetingStateSnapshots.findFirst({
          where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
          orderBy: (fields, { desc }) => desc(fields.createdAt),
        }),
        ctx.db.query.meetingEvents.findMany({
          where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
          orderBy: (fields, { desc }) => desc(fields.sequence),
          limit: input.eventLimit,
        }),
      ])

      return {
        meeting,
        participants,
        transcript,
        liveState,
        events,
      }
    }),

  getLiveState: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) return null

      return ctx.db.query.meetingStateSnapshots.findFirst({
        where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      })
    }),

  getParticipants: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) return []

      return ctx.db.query.meetingParticipants.findMany({
        where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
      })
    }),

  getTranscript: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) return []

      return ctx.db.query.transcriptSegments.findMany({
        where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
        orderBy: (fields, { desc }) => desc(fields.createdAt),
        limit: input.limit,
      })
    }),
})
