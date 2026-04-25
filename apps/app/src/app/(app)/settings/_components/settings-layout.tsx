'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, Building2, CreditCard, Users } from 'lucide-react'
import { cn } from '@kodi/ui/lib/utils'

const settingsSections = [
  { href: '/settings/general', label: 'General', icon: Building2 },
  { href: '/settings/members', label: 'Members', icon: Users },
  { href: '/settings/meeting-copilot', label: 'Meeting copilot', icon: Bot },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard },
]

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Settings
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your workspace configuration.
      </p>

      <nav className="mt-6 flex gap-1 border-b border-border">
        {settingsSections.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  )
}
