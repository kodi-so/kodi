'use client'

import { useOrg } from '@/lib/org-context'
import { DashboardAssistant } from './_components/dashboard-assistant'

export default function DashboardPage() {
  const { activeOrg } = useOrg()

  if (!activeOrg) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        Select a team to start a private assistant thread.
      </div>
    )
  }

  return (
    <DashboardAssistant orgId={activeOrg.orgId} orgName={activeOrg.orgName} />
  )
}
