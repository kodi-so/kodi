'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users } from 'lucide-react'
import { Button } from '@kodi/ui'

const settingsSections = [
  { href: '/settings/general', label: 'General', icon: Building2 },
  { href: '/settings/members', label: 'Members', icon: Users },
]

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full min-h-0">
      <aside className="kodi-sidebar-surface w-60 flex-shrink-0 border-r border-brand-line p-4">
        <h2 className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-brand-subtle">
          Settings
        </h2>
        <nav className="space-y-1">
          {settingsSections.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Button
                key={href}
                asChild
                variant={active ? 'secondary' : 'ghost'}
                className={`w-full justify-start gap-3 rounded-2xl px-3 py-3 text-sm ${
                  active
                    ? 'border border-brand-line bg-brand-accent-soft text-brand-accent-foreground shadow-brand-panel hover:bg-brand-accent-soft'
                    : 'text-brand-quiet hover:bg-brand-panel hover:text-foreground'
                }`}
              >
                <Link href={href}>
                  <Icon size={16} />
                  {label}
                </Link>
              </Button>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 overflow-auto p-6 sm:p-8">{children}</div>
    </div>
  )
}
