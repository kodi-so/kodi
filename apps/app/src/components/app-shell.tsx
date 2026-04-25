'use client'

import { OrgProvider } from '@/lib/org-context'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from './sidebar'
import { Toaster } from '@kodi/ui/components/sonner'
import { Separator } from '@kodi/ui/components/separator'
import { BillingBanner } from './billing-banner'
import { SubscriptionGate } from './subscription-gate'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </header>
          <BillingBanner />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <SubscriptionGate>{children}</SubscriptionGate>
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </OrgProvider>
  )
}
