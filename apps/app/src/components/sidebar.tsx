'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  MessageSquare,
  Video,
  Link2,
  ShieldCheck,
  Settings,
  Menu,
  X,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { useOrg } from '@/lib/org-context'
import { BrandLogo, Button, Card } from '@kodi/ui'

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/meetings', label: 'Meetings', icon: Video },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function OrgSwitcher() {
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  const handleBlur = () => setTimeout(() => setOpen(false), 150)

  if (orgs.length === 0) return null

  if (orgs.length === 1 && activeOrg) {
    return (
      <div className="border-b border-border/80 px-5 py-4">
        <p className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <p className="truncate text-sm text-foreground">{activeOrg.orgName}</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative border-b border-border/80 px-4 py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={handleBlur}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card/80 px-3 py-3 text-sm shadow-soft transition-colors hover:bg-secondary/80"
      >
        <span className="truncate text-foreground">
          {activeOrg?.orgName ?? 'Select workspace'}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <Card className="absolute left-4 right-4 top-full z-50 mt-2 overflow-hidden border-border/80 bg-card/95">
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onMouseDown={() => {
                setActiveOrg(org)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-sm transition-colors hover:bg-secondary"
            >
              <div className="min-w-0 text-left">
                <p className="truncate text-foreground">{org.orgName}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {org.role}
                </p>
              </div>
              {org.orgId === activeOrg?.orgId && (
                <Check size={14} className="flex-shrink-0 text-primary" />
              )}
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const navContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/80 px-5 py-5">
        <BrandLogo size={34} />
      </div>

      <OrgSwitcher />

      <nav className="flex-1 space-y-1 px-4 py-5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Button
              key={href}
              asChild
              variant={active ? 'secondary' : 'ghost'}
              className={`h-11 w-full justify-start gap-3 rounded-2xl px-3 text-sm font-medium ${
                active
                  ? 'border border-border/80 bg-secondary/80 text-foreground shadow-soft hover:bg-secondary'
                  : 'text-muted-foreground hover:bg-card/80'
              }`}
            >
              <Link href={href} onClick={() => setMobileOpen(false)}>
                <Icon size={18} />
                {label}
              </Link>
            </Button>
          )
        })}
      </nav>

      <div className="border-t border-border/80 px-4 py-4">
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border/80 bg-card/85 px-3 py-3 shadow-soft">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-foreground">
            <span>
              {session?.user?.name?.[0]?.toUpperCase() ??
                session?.user?.email?.[0]?.toUpperCase() ??
                '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">
              {session?.user?.name ?? 'User'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSignOut}
          variant="ghost"
          className="w-full justify-center gap-2 rounded-2xl"
        >
          Sign out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-72 flex-shrink-0 flex-col border-r border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(250,245,235,0.9))] md:flex">
        {navContent}
      </aside>

      <Button
        onClick={() => setMobileOpen(true)}
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(30,35,38,0.18)] backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(250,245,235,0.98))] transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-foreground"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {navContent}
      </aside>
    </>
  )
}
