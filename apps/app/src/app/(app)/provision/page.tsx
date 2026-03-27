import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db, instances, orgMembers } from '@kodi/db'
import { eq } from 'drizzle-orm'
import { ProvisionStatus } from './_components/provision-status'

export const metadata = {
  title: 'Provisioning — Kodi',
}

export default async function ProvisionPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // Find the user's org
  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, session.user.id),
    with: { org: true },
  })

  if (!membership) {
    redirect('/dashboard')
  }

  const orgId = membership.orgId

  // Find the org's instance
  const instance = await db.query.instances.findFirst({
    where: eq(instances.orgId, orgId),
  })

  const initialData = instance
    ? {
        id: instance.id,
        status: instance.status as 'pending' | 'installing' | 'running' | 'error' | 'suspended' | 'deleting' | 'deleted',
        hostname: instance.hostname ?? null,
        ipAddress: instance.ipAddress ?? null,
        errorMessage: instance.errorMessage ?? null,
        lastHealthCheck: instance.lastHealthCheck ?? null,
      }
    : null

  return (
    <div className="flex items-center justify-center min-h-full p-6">
      <ProvisionStatus orgId={orgId} initialData={initialData} />
    </div>
  )
}
