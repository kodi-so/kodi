import { z } from 'zod'
import {
  calendarEventCandidates,
  desktopDevices,
  desktopPreferences,
  eq,
} from '@kodi/db'
import { router, memberProcedure } from '../../trpc'
import {
  buildDesktopBootstrap,
  listUpcomingDesktopMeetings,
  serializePreferences,
  serializeUpcoming,
  upsertCalendarEventCandidate,
  getDesktopPreferences,
} from '../../lib/desktop/meetings'

const platformSchema = z.enum(['darwin', 'win32', 'linux', 'unknown'])
const updateChannelSchema = z.enum(['internal', 'beta', 'stable'])
const localModeSchema = z.enum(['solo', 'room'])

export const desktopRouter = router({
  getBootstrap: memberProcedure
    .input(
      z.object({
        deviceId: z.string().trim().min(1).max(160).optional(),
        platform: platformSchema.default('unknown'),
      })
    )
    .query(async ({ ctx, input }) => {
      return buildDesktopBootstrap(ctx.db, {
        org: {
          id: ctx.org.id,
          name: ctx.org.name,
          slug: ctx.org.slug ?? null,
        },
        user: {
          id: ctx.session.user.id,
          name: ctx.session.user.name,
          email: ctx.session.user.email,
        },
        platform: input.platform,
        deviceId: input.deviceId ?? null,
      })
    }),

  listUpcomingMeetings: memberProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await listUpcomingDesktopMeetings(ctx.db, {
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
        from: input.from ? new Date(input.from) : undefined,
        to: input.to ? new Date(input.to) : undefined,
        limit: input.limit,
      })
      return rows.map(serializeUpcoming)
    }),

  savePreferences: memberProcedure
    .input(
      z.object({
        remindersEnabled: z.boolean().optional(),
        reminderLeadTimeMinutes: z.number().int().min(0).max(60).optional(),
        moveAsideEnabled: z.boolean().optional(),
        launchAtLogin: z.boolean().optional(),
        defaultLocalSessionMode: localModeSchema.optional(),
        updateChannel: updateChannelSchema.optional(),
        activeCalendarConnectionIds: z.array(z.string()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await getDesktopPreferences(ctx.db, {
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
      })
      const [updated] = await ctx.db
        .update(desktopPreferences)
        .set({
          remindersEnabled: input.remindersEnabled ?? current.remindersEnabled,
          reminderLeadTimeMinutes:
            input.reminderLeadTimeMinutes ?? current.reminderLeadTimeMinutes,
          moveAsideEnabled: input.moveAsideEnabled ?? current.moveAsideEnabled,
          launchAtLogin: input.launchAtLogin ?? current.launchAtLogin,
          defaultLocalSessionMode:
            input.defaultLocalSessionMode ?? current.defaultLocalSessionMode,
          updateChannel: input.updateChannel ?? current.updateChannel,
          activeCalendarConnectionIds:
            input.activeCalendarConnectionIds ??
            current.activeCalendarConnectionIds,
          updatedAt: new Date(),
        })
        .where(eq(desktopPreferences.id, current.id))
        .returning()

      return { preferences: serializePreferences(updated ?? current) }
    }),

  registerDevice: memberProcedure
    .input(
      z.object({
        deviceId: z.string().trim().min(1).max(160),
        platform: platformSchema.default('unknown'),
        appVersion: z.string().trim().max(80).optional(),
        updateChannel: updateChannelSchema.default('internal'),
        deviceName: z.string().trim().max(160).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const [device] = await ctx.db
        .insert(desktopDevices)
        .values({
          id: input.deviceId,
          orgId: ctx.org.id,
          userId: ctx.session.user.id,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          updateChannel: input.updateChannel,
          deviceName: input.deviceName ?? null,
          lastHeartbeatAt: now,
        })
        .onConflictDoUpdate({
          target: desktopDevices.id,
          set: {
            platform: input.platform,
            appVersion: input.appVersion ?? null,
            updateChannel: input.updateChannel,
            deviceName: input.deviceName ?? null,
            lastHeartbeatAt: now,
            updatedAt: now,
          },
        })
        .returning()

      return { device }
    }),

  heartbeat: memberProcedure
    .input(
      z.object({
        deviceId: z.string().trim().min(1).max(160),
        activeMeetingSessionId: z.string().nullable().optional(),
        diagnostics: z.record(z.unknown()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db
        .update(desktopDevices)
        .set({
          lastHeartbeatAt: now,
          activeMeetingSessionId: input.activeMeetingSessionId ?? null,
          diagnostics: input.diagnostics ?? null,
          updatedAt: now,
        })
        .where(eq(desktopDevices.id, input.deviceId))
      return { ok: true, heartbeatAt: now.toISOString() }
    }),

  syncCalendarEventCandidate: memberProcedure
    .input(
      z.object({
        calendarProvider: z.enum(['google_calendar', 'outlook_calendar']),
        connectedAccountId: z.string().trim().min(1).max(240),
        externalEventId: z.string().trim().min(1).max(300),
        iCalUid: z.string().trim().max(300).nullable().optional(),
        title: z.string().trim().min(1).max(300),
        description: z.string().max(4000).nullable().optional(),
        location: z.string().max(500).nullable().optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().nullable().optional(),
        responseStatus: z
          .enum([
            'accepted',
            'tentative',
            'declined',
            'needs_action',
            'unknown',
          ])
          .default('unknown'),
        attendees: z.array(z.record(z.unknown())).nullable().optional(),
        joinUrl: z.string().url().nullable().optional(),
        isCanceled: z.boolean().default(false),
        isLikelyMeeting: z.boolean().default(true),
        metadata: z.record(z.unknown()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await upsertCalendarEventCandidate(ctx.db, {
        orgId: ctx.org.id,
        userId: ctx.session.user.id,
        calendarProvider: input.calendarProvider,
        connectedAccountId: input.connectedAccountId,
        externalEventId: input.externalEventId,
        iCalUid: input.iCalUid ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        responseStatus: input.responseStatus,
        attendees: input.attendees ?? null,
        joinUrl: input.joinUrl ?? null,
        isCanceled: input.isCanceled,
        isLikelyMeeting: input.isLikelyMeeting,
        metadata: input.metadata ?? null,
      })

      return serializeUpcoming(row)
    }),

  dismissCalendarEvent: memberProcedure
    .input(z.object({ calendarEventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(calendarEventCandidates)
        .set({
          metadata: { dismissedAt: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(calendarEventCandidates.id, input.calendarEventId))
      return { ok: true }
    }),
})
