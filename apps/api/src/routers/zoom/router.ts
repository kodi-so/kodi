import { z } from 'zod'
import { router, memberProcedure, ownerProcedure } from '../../trpc'
import { getFeatureFlags } from '../../lib/features'
import { getZoomSetupStatus } from '../../lib/zoom-config'
import { createZoomInstallUrl, hasZoomZakScope } from '../../lib/zoom'
import { eq, providerInstallations } from '@kodi/db'

export const zoomRouter = router({
  getInstallStatus: memberProcedure.query(async ({ ctx }) => {
    const rawInstallation = await ctx.db.query.providerInstallations.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.orgId, ctx.org.id), eq(fields.provider, 'zoom')),
    })
    const installation =
      rawInstallation?.status === 'revoked' ? null : rawInstallation

    return {
      featureFlags: getFeatureFlags(),
      setup: getZoomSetupStatus(),
      signedInBotsReady:
        installation?.status === 'active' &&
        hasZoomZakScope(installation.scopes ?? []),
      installation: installation
        ? {
            id: installation.id,
            provider: installation.provider,
            status: installation.status,
            externalAccountId: installation.externalAccountId,
            externalAccountEmail: installation.externalAccountEmail,
            scopes: installation.scopes ?? [],
            hasZakScope: hasZoomZakScope(installation.scopes ?? []),
            createdAt: installation.createdAt,
            updatedAt: installation.updatedAt,
            errorMessage: installation.errorMessage,
          }
        : null,
    }
  }),

  getInstallUrl: ownerProcedure
    .input(
      z.object({
        returnPath: z.string().startsWith('/').optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return {
        url: createZoomInstallUrl(
          ctx.org.id,
          ctx.session.user.id,
          input.returnPath
        ),
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
      .delete(providerInstallations)
      .where(
        eq(providerInstallations.id as never, existing.id as never) as never
      )

    return { success: true }
  }),
})
