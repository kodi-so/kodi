'use client'

import { OrgProvider } from '@/lib/org-context'
import { Sidebar } from './sidebar'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </OrgProvider>
  )
}
