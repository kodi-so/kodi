import { z } from 'zod'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { MeetingOrchestrationService } from '../../lib/meetings/orchestration-service'
import { createDefaultMeetingProviderGateway } from '../../lib/meetings/provider-runtime'
import { TRPCError } from '@trpc/server'
import {
  eq,
  meetingAnswers,
  meetingArtifacts,
  meetingCopilotSettings,
  meetingParticipationModeValues,
  meetingSessionControls,
  meetingSessions,
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
import { generateMeetingAnswer } from '../../lib/meetings/answer-engine'
import {
  cancelAnswer,
  createAnswerRequest,
  listMeetingAnswers,
  markAnswerDeliveredToUi,
  markAnswerDeliveredToVoice,
  markAnswerFailed,
  markAnswerGrounded,
  markAnswerSpeaking,
  suppressAnswer,
  transitionAnswerState,
} from '../../lib/meetings/answer-lifecycle'
import {
  evaluateVoicePolicy,
  isAnswerFreshForVoice,
  isAnswerSpeakable,
  truncateForVoice,
} from '../../lib/meetings/voice-policy'
import { acquireVoiceLock, interruptActiveVoice } from '../../lib/meetings/voice-concurrency'
import { generateSpeech, isTtsAvailable } from '../../lib/providers/tts/client'
import { markdownToMeetingPlainText } from '../../lib/meetings/answer-format'
import { sendRecallBotOutputAudio } from '../../lib/providers/recall/client'
import { retryPostMeetingArtifacts } from '../../lib/meetings/post-meeting-service'
import {
  queueMeetingRecap,
  type RecapDeliveryTarget,
} from '../../lib/meetings/work-item-sync'

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

  delete: memberProcedure
    .input(z.object({ meetingSessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting not found.' })
      }

      await ctx.db
        .delete(meetingSessions)
        .where(eq(meetingSessions.id, input.meetingSessionId))

      return { deleted: true }
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
    const config = await getWorkspaceMeetingCopilotConfig(
      ctx.db,
      {
        id: ctx.org.id,
        name: ctx.org.name,
        slug: ctx.org.slug,
      }
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

      const config = await getWorkspaceMeetingCopilotConfig(
        ctx.db,
        {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug,
        }
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
      const copilotConfig = await getWorkspaceMeetingCopilotConfig(
        ctx.db,
        {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug,
        }
      )

      const result = await orchestration.requestBotJoin({
        orgId: ctx.org.id,
        provider,
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

  askKodi: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        question: z.string().trim().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      const answer = await createAnswerRequest({
        meetingSessionId: meeting.id,
        orgId: ctx.org.id,
        requestedByUserId: ctx.session.user.id,
        source: 'ui',
        question: input.question,
      })

      await transitionAnswerState(answer.id, meeting.id, 'preparing')

      const result = await generateMeetingAnswer({
        orgId: ctx.org.id,
        meetingSession: meeting,
        question: input.question,
        deliveryMode: 'ui',
      })

      if (!result.ok) {
        if (result.reason === 'no-context') {
          await suppressAnswer(answer.id, meeting.id, 'No meeting context available yet.')
          return { answerId: answer.id, status: 'suppressed' as const, answerText: null, failureReason: null }
        }

        await markAnswerFailed(answer.id, meeting.id, result.reason)
        return { answerId: answer.id, status: 'failed' as const, answerText: null, failureReason: result.reason }
      }

      await markAnswerGrounded(answer.id, meeting.id, result.answerText, result.grounding)
      await markAnswerDeliveredToUi(answer.id, meeting.id)

      return {
        answerId: answer.id,
        status: 'delivered_to_ui' as const,
        answerText: result.answerText,
        failureReason: null,
      }
    }),

  getAnswers: memberProcedure
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

      return listMeetingAnswers(meeting.id)
    }),

  cancelAnswer: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        answerId: z.string(),
        reason: z.string().trim().max(240).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      const answer = await ctx.db.query.meetingAnswers.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.answerId),
            eq(fields.meetingSessionId, meeting.id)
          ),
        columns: { id: true, status: true },
      })

      if (!answer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Answer not found.' })
      }

      const terminalStatuses = [
        'delivered_to_ui',
        'delivered_to_chat',
        'delivered_to_voice',
        'failed',
        'canceled',
        'stale',
      ]
      if (terminalStatuses.includes(answer.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Answer is already in terminal state: ${answer.status}`,
        })
      }

      await cancelAnswer(input.answerId, meeting.id, input.reason)
      return { ok: true }
    }),

  speakAnswer: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        answerId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isTtsAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'TTS is not configured on this server.',
        })
      }

      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      const answer = await ctx.db.query.meetingAnswers.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.answerId),
            eq(fields.meetingSessionId, meeting.id)
          ),
      })

      if (!answer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Answer not found.' })
      }

      // Policy gate
      const workspaceConfig = await getWorkspaceMeetingCopilotConfig(ctx.db, {
        id: ctx.org.id,
        name: ctx.org.name,
        slug: ctx.org.slug,
      })

      const controls = await resolveMeetingSessionControls(ctx.db, {
        meetingSessionId: meeting.id,
        orgId: ctx.org.id,
        settings: workspaceConfig.settings,
      })

      const policy = evaluateVoicePolicy({
        participationMode: controls.participationMode,
        liveResponsesDisabled: controls.liveResponsesDisabled,
        liveResponsesDisabledReason: controls.liveResponsesDisabledReason,
        settings: workspaceConfig.settings,
        requireExplicitPrompt: false, // UI-triggered speak is an explicit prompt
      })

      if (!policy.voiceAllowed) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: policy.suppressionReason ?? 'Voice output is not allowed.',
        })
      }

      // Eligibility checks
      const speakableCheck = isAnswerSpeakable(answer)
      if (!speakableCheck.eligible) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: speakableCheck.reason })
      }

      const freshnessCheck = isAnswerFreshForVoice(answer)
      if (!freshnessCheck.eligible) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: freshnessCheck.reason })
      }

      const botSessionId = meeting.providerBotSessionId
      if (!botSessionId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No active bot session for voice output.',
        })
      }

      // Acquire per-session voice lock (interrupts any in-flight response)
      const lockResult = acquireVoiceLock(meeting.id, answer.id, () => {
        void markAnswerFailed(answer.id, meeting.id, 'Interrupted by newer voice request.').catch(() => {})
      })

      if (!lockResult.acquired) {
        throw new TRPCError({ code: 'CONFLICT', message: lockResult.reason })
      }

      try {
        await markAnswerSpeaking(answer.id, meeting.id)

        const voiceText = truncateForVoice(
          markdownToMeetingPlainText(answer.answerText!)
        )

        const ttsResult = await generateSpeech({ text: voiceText })

        if (!ttsResult.ok) {
          await markAnswerFailed(answer.id, meeting.id, `TTS failed: ${ttsResult.reason}`)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `TTS generation failed: ${ttsResult.reason}`,
          })
        }

        await sendRecallBotOutputAudio(botSessionId, ttsResult.audioBuffer)

        await markAnswerDeliveredToVoice(answer.id, meeting.id)

        return { ok: true, answerId: answer.id, status: 'delivered_to_voice' as const }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        const message = err instanceof Error ? err.message : String(err)
        await markAnswerFailed(answer.id, meeting.id, message)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      } finally {
        lockResult.release()
      }
    }),

  stopVoice: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true, providerBotSessionId: true },
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      const interruptedAnswerId = interruptActiveVoice(meeting.id)

      if (interruptedAnswerId) {
        await suppressAnswer(
          interruptedAnswerId,
          meeting.id,
          'Voice output stopped by operator.'
        )
      }

      return { ok: true, stoppedAnswerId: interruptedAnswerId ?? null }
    }),

  listArtifacts: memberProcedure
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

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      return ctx.db.query.meetingArtifacts.findMany({
        where: (fields, { eq }) => eq(fields.meetingSessionId, meeting.id),
        orderBy: (fields, { asc }) => asc(fields.createdAt),
      })
    }),

  retryArtifacts: ownerProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true },
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      void retryPostMeetingArtifacts(meeting.id, ctx.org.id).catch((error) => {
        console.warn('[meetings] retryArtifacts failed', {
          orgId: ctx.org.id,
          meetingSessionId: meeting.id,
          error: error instanceof Error ? error.message : String(error),
        })
      })

      return { ok: true }
    }),

  deliverRecap: memberProcedure
    .input(
      z.object({
        meetingSessionId: z.string(),
        target: z.enum(['slack', 'zoom']),
        channelId: z.string().trim().max(200).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await ctx.db.query.meetingSessions.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.id, input.meetingSessionId),
            eq(fields.orgId, ctx.org.id)
          ),
        columns: { id: true, title: true, status: true },
      })

      if (!meeting) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting session not found.' })
      }

      try {
        const result = await queueMeetingRecap({
          db: ctx.db,
          orgId: ctx.org.id,
          actorUserId: ctx.session.user.id,
          meetingSessionId: meeting.id,
          meetingTitle: meeting.title,
          target: input.target as RecapDeliveryTarget,
          channelId: input.channelId ?? null,
        })

        return result
      } catch (error) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to queue meeting recap delivery.',
        })
      }
    }),
})
