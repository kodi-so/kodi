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
      {/* Left nav sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-3">
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
                className={`w-full justify-start gap-3 px-3 py-2.5 text-sm font-medium ${
                  active
                    ? 'border border-indigo-500/20 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
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

      {/* Content area */}
      <div className="flex-1 overflow-auto p-8">{children}</div>
    </div>
  )
}
