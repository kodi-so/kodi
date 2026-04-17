'use client'

import { OrgProvider } from '@/lib/org-context'
import { Sidebar } from './sidebar'
import { Toaster, TooltipProvider } from '@kodi/ui'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex min-h-screen bg-background text-foreground">
          <Sidebar />
          <main className="kodi-app-shell min-w-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </OrgProvider>
  )
}
