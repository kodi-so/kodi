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
      <aside className="w-56 flex-shrink-0 border-r border-white/10 bg-[rgba(27,40,45,0.82)] p-4">
        <h2 className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-[#8ea3a8]">
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
                    ? 'border border-[#DFAE56]/24 bg-[#DFAE56]/14 text-[#F0C570] hover:bg-[#DFAE56]/18 hover:text-[#f6d289]'
                    : 'text-[#9eb1b5] hover:bg-white/6 hover:text-white'
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
