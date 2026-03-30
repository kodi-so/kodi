import { router, memberProcedure } from '../../trpc'
import { getFeatureFlags } from '../../lib/features'
import { getZoomSetupStatus } from '../../lib/zoom-config'

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
})
