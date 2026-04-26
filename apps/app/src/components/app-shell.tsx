'use client'

import { OrgProvider } from '@/lib/org-context'
import { AppSidebar, SidebarProvider, SidebarInset } from './sidebar'
import { Toaster } from '@kodi/ui/components/sonner'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </OrgProvider>
  )
}
