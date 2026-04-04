'use client'

import type { ReactNode } from 'react'
import { OrgProvider } from '@/lib/org-context'
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="relative flex min-h-screen overflow-hidden bg-transparent text-[#223239]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,174,86,0.18),transparent_24%),radial-gradient(circle_at_85%_8%,rgba(111,168,140,0.12),transparent_20%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(62,80,86,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(62,80,86,0.05)_1px,transparent_1px)] bg-[size:88px_88px] opacity-40 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.3),transparent_82%)]"
        />
        <Sidebar />
        <main className="relative flex-1 overflow-auto">{children}</main>
      </div>
    </OrgProvider>
  )
}
