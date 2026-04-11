import { z } from 'zod'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { MeetingOrchestrationService } from '../../lib/meetings/orchestration-service'
import { createDefaultMeetingProviderGateway } from '../../lib/meetings/provider-runtime'
import { TRPCError } from '@trpc/server'
import {
  and,
  eq,
  meetingCopilotSettings,
  meetingParticipationModeValues,
  meetingSessionControls,
} from '@kodi/db'
import { inferMeetingProviderFromUrl } from '../../lib/meetings/provider-url'
import {
  appendMeetingAuditEvent,
  ensureMeetingSessionControls,
  getWorkspaceMeetingCopilotConfig,
  resolveMeetingSessionControls,
} from '../../lib/meetings/copilot-policy'
import { logActivity } from '../../lib/activity'
import { resolveMeetingHealthSnapshot } from '../../lib/meetings/health'

const meetingParticipationModeSchema = z.enum(meetingParticipationModeValues)

const meetingCopilotSettingsInputSchema = z.object({
  botDisplayName: z.string().trim().max(80).nullable(),
  defaultParticipationMode: meetingParticipationModeSchema,
  chatResponsesRequireExplicitAsk: z.boolean(),
  voiceResponsesRequireExplicitPrompt: z.boolean(),
  allowMeetingHostControls: z.boolean(),
  consentNoticeEnabled: z.boolean(),
  transcriptRetentionDays: z.number().int().min(1).max(3650),
  artifactRetentionDays: z.number().int().min(1).max(3650),
})

async function getActiveZoomInstallation(
  database: typeof import('@kodi/db').db,
  orgId: string
) {
  const installation = await database.query.providerInstallations.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.orgId, orgId), eq(fields.provider, 'zoom')),
  })

  if (!installation || installation.status === 'revoked') {
    return null
  }

  return installation
}

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

  getCopilotSettings: memberProcedure.query(async ({ ctx }) => {
    const installation = await getActiveZoomInstallation(ctx.db, ctx.org.id)

    const config = await getWorkspaceMeetingCopilotConfig(
      ctx.db,
      {
        id: ctx.org.id,
        name: ctx.org.name,
        slug: ctx.org.slug,
      },
      installation
    )

    return {
      settings: config.settings,
      identity: config.identity,
      setup: config.setup,
      isOwner: ctx.userRole === 'owner',
      updatedAt: config.persisted?.updatedAt ?? null,
    }
  }),

  updateCopilotSettings: ownerProcedure
    .input(meetingCopilotSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.meetingCopilotSettings.findFirst({
        where: (fields, { eq }) => eq(fields.orgId, ctx.org.id),
        columns: { orgId: true },
      })

      const values = {
        botDisplayName: input.botDisplayName?.trim() || null,
        defaultParticipationMode: input.defaultParticipationMode,
        chatResponsesRequireExplicitAsk: input.chatResponsesRequireExplicitAsk,
        voiceResponsesRequireExplicitPrompt:
          input.voiceResponsesRequireExplicitPrompt,
        allowMeetingHostControls: input.allowMeetingHostControls,
        consentNoticeEnabled: input.consentNoticeEnabled,
        transcriptRetentionDays: input.transcriptRetentionDays,
        artifactRetentionDays: input.artifactRetentionDays,
        updatedBy: ctx.session.user.id,
        updatedAt: new Date(),
      }

      if (existing) {
        await ctx.db
          .update(meetingCopilotSettings)
          .set(values)
          .where(eq(meetingCopilotSettings.orgId, ctx.org.id))
      } else {
        await ctx.db.insert(meetingCopilotSettings).values({
          orgId: ctx.org.id,
          ...values,
        })
      }

      await logActivity(
        ctx.db,
        ctx.org.id,
        'meeting.copilot_settings.updated',
        {
          defaultParticipationMode: input.defaultParticipationMode,
          allowMeetingHostControls: input.allowMeetingHostControls,
          transcriptRetentionDays: input.transcriptRetentionDays,
          artifactRetentionDays: input.artifactRetentionDays,
        },
        ctx.session.user.id
      )

      const installation = await getActiveZoomInstallation(ctx.db, ctx.org.id)
      const config = await getWorkspaceMeetingCopilotConfig(
        ctx.db,
        {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug,
        },
        installation
      )

      return {
        settings: config.settings,
        identity: config.identity,
        setup: config.setup,
        updatedAt: config.persisted?.updatedAt ?? null,
      }
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

      const gateway = createDefaultMeetingProviderGateway()

      const [participants, transcript, liveState, events, workspaceConfig, health] =
        await Promise.all([
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
        getWorkspaceMeetingCopilotConfig(ctx.db, {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug,
        }),
        resolveMeetingHealthSnapshot(ctx.db, gateway, {
          orgId: ctx.org.id,
          meetingSession: meeting,
        }),
        ])

      const controls = await resolveMeetingSessionControls(ctx.db, {
        meetingSessionId: meeting.id,
        orgId: ctx.org.id,
        settings: workspaceConfig.settings,
      })

      return {
        meeting,
        participants,
        transcript,
        liveState,
        events,
        health,
        workspaceSettings: workspaceConfig.settings,
        controls,
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

  updateSessionControls: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        participationMode: meetingParticipationModeSchema.optional(),
        liveResponsesDisabled: z.boolean().optional(),
        liveResponsesDisabledReason: z
          .string()
          .trim()
          .max(240)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, input.meetingSessionId), eq(fields.orgId, ctx.org.id)),
        columns: {
          id: true,
          orgId: true,
          title: true,
          hostUserId: true,
        },
      })

      if (!meeting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Meeting session not found.',
        })
      }

      const config = await getWorkspaceMeetingCopilotConfig(ctx.db, {
        id: ctx.org.id,
        name: ctx.org.name,
        slug: ctx.org.slug,
      })

      const currentControls = await resolveMeetingSessionControls(ctx.db, {
        meetingSessionId: meeting.id,
        orgId: ctx.org.id,
        settings: config.settings,
      })

      const canControlAsMeetingStarter =
        meeting.hostUserId === ctx.session.user.id &&
        currentControls.allowHostControls

      if (ctx.userRole !== 'owner' && !canControlAsMeetingStarter) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Only workspace owners or the meeting starter can change live meeting controls.',
        })
      }

      const nextParticipationMode =
        input.participationMode ?? currentControls.participationMode
      const nextLiveResponsesDisabled =
        input.liveResponsesDisabled ?? currentControls.liveResponsesDisabled
      const nextLiveResponsesDisabledReason =
        input.liveResponsesDisabled === undefined
          ? currentControls.liveResponsesDisabledReason
          : nextLiveResponsesDisabled
            ? input.liveResponsesDisabledReason?.trim() ||
              'Disabled from the Kodi meeting console.'
            : null

      const persisted = await ctx.db.query.meetingSessionControls.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.meetingSessionId, meeting.id),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (persisted) {
        await ctx.db
          .update(meetingSessionControls)
          .set({
            participationMode: nextParticipationMode,
            liveResponsesDisabled: nextLiveResponsesDisabled,
            liveResponsesDisabledReason: nextLiveResponsesDisabledReason,
            updatedBy: ctx.session.user.id,
            updatedAt: new Date(),
          })
          .where(eq(meetingSessionControls.id, persisted.id))
      } else {
        await ctx.db.insert(meetingSessionControls).values({
          orgId: ctx.org.id,
          meetingSessionId: meeting.id,
          participationMode: nextParticipationMode,
          allowHostControls: config.settings.allowMeetingHostControls,
          liveResponsesDisabled: nextLiveResponsesDisabled,
          liveResponsesDisabledReason: nextLiveResponsesDisabledReason,
          updatedBy: ctx.session.user.id,
        })
      }

      await appendMeetingAuditEvent(ctx.db, {
        meetingSessionId: meeting.id,
        eventType: 'meeting.controls.updated',
        payload: {
          previous: currentControls,
          next: {
            participationMode: nextParticipationMode,
            allowHostControls: currentControls.allowHostControls,
            liveResponsesDisabled: nextLiveResponsesDisabled,
            liveResponsesDisabledReason: nextLiveResponsesDisabledReason,
          },
          actorUserId: ctx.session.user.id,
        },
      })

      await logActivity(
        ctx.db,
        ctx.org.id,
        'meeting.session_controls.updated',
        {
          meetingSessionId: meeting.id,
          meetingTitle: meeting.title,
          participationMode: nextParticipationMode,
          liveResponsesDisabled: nextLiveResponsesDisabled,
        },
        ctx.session.user.id
      )

      return resolveMeetingSessionControls(ctx.db, {
        meetingSessionId: meeting.id,
        orgId: ctx.org.id,
        settings: config.settings,
      })
    }),

  getHealth: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        forceRefresh: z.boolean().optional(),
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

      const gateway = createDefaultMeetingProviderGateway()
      return resolveMeetingHealthSnapshot(ctx.db, gateway, {
        orgId: ctx.org.id,
        meetingSession: meeting,
        forceRefresh: input.forceRefresh ?? false,
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
      const activeZoomInstallation = await getActiveZoomInstallation(
        ctx.db,
        ctx.org.id
      )
      const copilotConfig = await getWorkspaceMeetingCopilotConfig(
        ctx.db,
        {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug,
        },
        activeZoomInstallation
      )
      const installation =
        provider === 'zoom' && activeZoomInstallation?.status === 'active'
          ? activeZoomInstallation
          : null

      const result = await orchestration.requestBotJoin({
        orgId: ctx.org.id,
        provider,
        providerInstallationId: installation?.id ?? null,
        actor:
          provider === 'zoom' && installation
            ? {
                installerUserId: installation.installerUserId ?? null,
                externalAccountId: installation.externalAccountId ?? null,
                externalAccountEmail: installation.externalAccountEmail ?? null,
              }
            : null,
        hostUserId: ctx.session.user.id,
        meeting: {
          joinUrl: input.meetingUrl,
          title: input.title?.trim() || null,
        },
        botIdentity: {
          displayName: copilotConfig.identity.displayName,
        },
        metadata: {
          meetingCopilotPolicy: {
            defaultParticipationMode:
              copilotConfig.settings.defaultParticipationMode,
            chatResponsesRequireExplicitAsk:
              copilotConfig.settings.chatResponsesRequireExplicitAsk,
            voiceResponsesRequireExplicitPrompt:
              copilotConfig.settings.voiceResponsesRequireExplicitPrompt,
            allowMeetingHostControls:
              copilotConfig.settings.allowMeetingHostControls,
            consentNoticeEnabled: copilotConfig.settings.consentNoticeEnabled,
            transcriptRetentionDays:
              copilotConfig.settings.transcriptRetentionDays,
            artifactRetentionDays:
              copilotConfig.settings.artifactRetentionDays,
          },
        },
      })

      await ensureMeetingSessionControls(ctx.db, {
        meetingSessionId: result.meetingSession.id,
        orgId: ctx.org.id,
        settings: copilotConfig.settings,
        actorUserId: ctx.session.user.id,
      })

      return {
        ok: true,
        meetingSessionId: result.meetingSession.id,
        status: result.meetingSession.status,
      }
    }),
})
