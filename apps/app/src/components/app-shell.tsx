'use client'

import { OrgProvider } from '@/lib/org-context'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from './sidebar'
import { Toaster, Separator } from '@kodi/ui'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </header>
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </OrgProvider>
  )
}
