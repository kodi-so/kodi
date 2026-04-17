'use client'

import { OrgProvider } from '@/lib/org-context'
import { AppSidebar, SidebarProvider, SidebarInset } from './sidebar'
import { Toaster } from '@kodi/ui'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </OrgProvider>
  )
}
