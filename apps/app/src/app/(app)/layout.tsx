import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@kodi/db'
import { instances, orgMembers, organizations } from '@kodi/db'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // Onboarding guard — redirect new org owners to the wizard before the app.
  // Members (non-owners) are never redirected; their org is already set up.
  await checkOnboardingGuard(session.user.id)

  return <AppShell>{children}</AppShell>
}

async function checkOnboardingGuard(userId: string) {
  // Find the user's first org membership
  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, userId),
    columns: { role: true, orgId: true },
  })

  if (!membership || membership.role !== 'owner') return

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, membership.orgId),
    columns: { id: true, completedOnboardingAt: true },
  })

  if (!org) return

  // If the org already completed onboarding, allow through
  if (org.completedOnboardingAt) return

  // Treat orgs that already have a running instance as complete (backfill for
  // existing users who pre-date this migration — no DB backfill needed).
  const runningInstance = await db.query.instances.findFirst({
    where: (fields, { and, eq: eqField }) =>
      and(eqField(fields.orgId, org.id), eqField(fields.status, 'running')),
    columns: { id: true },
  })
  if (runningInstance) return

  // New owner, no completed onboarding, no running instance → send to wizard
  redirect('/onboarding?step=org-setup')
}
