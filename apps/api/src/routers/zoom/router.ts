import { eq } from 'drizzle-orm'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { getFeatureFlags } from '../../lib/features'
import { getZoomSetupStatus } from '../../lib/zoom-config'
import { createZoomInstallUrl } from '../../lib/zoom'
import { providerInstallations } from '@kodi/db'

export const zoomRouter = router({
  getInstallStatus: memberProcedure.query(async ({ ctx }) => {
    const installation = await ctx.db.query.providerInstallations.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, ctx.org.id), eq(fields.provider, 'zoom')),
    })

    return {
      featureFlags: getFeatureFlags(),
      setup: getZoomSetupStatus(),
      installation: installation
        ? {
            id: installation.id,
            provider: installation.provider,
            status: installation.status,
            externalAccountId: installation.externalAccountId,
            externalAccountEmail: installation.externalAccountEmail,
            scopes: installation.scopes ?? [],
            createdAt: installation.createdAt,
            updatedAt: installation.updatedAt,
            errorMessage: installation.errorMessage,
          }
        : null,
    }
  }),

  getInstallUrl: ownerProcedure.mutation(async ({ ctx }) => {
    return {
      url: createZoomInstallUrl(ctx.org.id, ctx.session.user.id),
    }
  }),

  disconnect: ownerProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.providerInstallations.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, ctx.org.id), eq(fields.provider, 'zoom')),
      columns: { id: true },
    })

    if (!existing) return { success: true }

    await ctx.db
      .update(providerInstallations)
      .set({
        status: 'revoked',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        eq(providerInstallations.id as never, existing.id as never) as never
      )

    return { success: true }
  }),
})
