import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@kodi/db'
import { instances, orgMembers, organizations, subscriptions } from '@kodi/db'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // Guards — redirect new org owners through onboarding and billing before the app.
  // Members (non-owners) are never redirected; their org is already set up.
  await checkGuards(session.user.id)

  return <AppShell>{children}</AppShell>
}

async function checkGuards(userId: string) {
  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, userId),
    columns: { role: true, orgId: true },
  })

  if (!membership || membership.role !== 'owner') return

  const [org, runningInstance] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, membership.orgId),
      columns: { id: true, completedOnboardingAt: true },
    }),
    db.query.instances.findFirst({
      where: (fields, { and, eq: eqField }) =>
        and(eqField(fields.orgId, membership.orgId), eqField(fields.status, 'running')),
      columns: { id: true },
    }),
  ])

  if (!org) return

  // Backfill: existing orgs with a running instance bypass all guards — they
  // pre-date onboarding and billing migrations and are already fully set up.
  if (runningInstance) return

  // Onboarding guard — wizard not completed yet
  if (!org.completedOnboardingAt) {
    redirect('/onboarding?step=org-setup')
  }

  // Paywall guard — onboarding complete but no active subscription
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, org.id),
    columns: { status: true },
  })
  if (!sub || sub.status !== 'active') {
    redirect('/onboarding?step=choose-plan')
  }
}
