'use client'

import { OrgProvider } from '@/lib/org-context'
import { Sidebar } from './sidebar'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_18rem)]">
          {children}
        </main>
      </div>
    </OrgProvider>
  )
}
