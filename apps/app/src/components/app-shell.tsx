'use client'

import { OrgProvider } from '@/lib/org-context'
import { AppSidebar, SidebarProvider, SidebarInset } from './sidebar'
import { Toaster } from '@kodi/ui/components/sonner'
import { BillingBanner } from './billing-banner'
import { SubscriptionGate } from './subscription-gate'
import { ProvisioningGate } from './provisioning-gate'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <BillingBanner />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <SubscriptionGate>
              <ProvisioningGate>{children}</ProvisioningGate>
            </SubscriptionGate>
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </OrgProvider>
  )
}
