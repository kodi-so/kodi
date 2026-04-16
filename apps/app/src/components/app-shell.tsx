'use client'

import { OrgProvider } from '@/lib/org-context'
import { Sidebar } from './sidebar'
import { BillingBanner } from './billing-banner'
import { SubscriptionGate } from './subscription-gate'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="kodi-app-shell min-w-0 flex-1 overflow-auto">
          <BillingBanner />
          <SubscriptionGate>{children}</SubscriptionGate>
        </main>
      </div>
    </OrgProvider>
  )
}
