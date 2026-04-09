import { z } from 'zod'
import { router, memberProcedure } from '../../trpc'
import { MeetingOrchestrationService } from '../../lib/meetings/orchestration-service'
import { createDefaultMeetingProviderGateway } from '../../lib/meetings/provider-runtime'
import { TRPCError } from '@trpc/server'
import { deriveMeetingBotIdentity } from '@kodi/db'
import { inferMeetingProviderFromUrl } from '../../lib/meetings/provider-url'

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
          liveSummary: true,
          metadata: true,
          actualStartAt: true,
          endedAt: true,
          createdAt: true,
          updatedAt: true,
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

  joinByUrl: memberProcedure
    .input(
      z.object({
        meetingUrl: z.string().url(),
        title: z.string().trim().min(1).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = inferMeetingProviderFromUrl(input.meetingUrl)
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only Google Meet and Zoom links are supported right now.',
        })
      }

      const orchestration = new MeetingOrchestrationService(
        createDefaultMeetingProviderGateway()
      )
      const meetingBotIdentity = deriveMeetingBotIdentity({
        orgName: ctx.org.name,
        orgSlug: ctx.org.slug,
      })

      const result = await orchestration.requestBotJoin({
        orgId: ctx.org.id,
        provider,
        hostUserId: ctx.session.user.id,
        meeting: {
          joinUrl: input.meetingUrl,
          title: input.title?.trim() || null,
        },
        botIdentity: {
          displayName: meetingBotIdentity.displayName,
        },
      })

      return {
        ok: true,
        meetingSessionId: result.meetingSession.id,
        status: result.meetingSession.status,
      }
    }),
})
