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
  ChevronUp,
  Check,
  LogOut,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { useOrg } from '@/lib/org-context'
import { BrandLogo, Button, Card } from '@kodi/ui'

const navItems = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/meetings', label: 'Meetings', icon: Video },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
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
      <div className="border-b border-brand-line px-5 py-4">
        <p className="mb-1 text-xs uppercase tracking-[0.16em] text-brand-subtle">
          Workspace
        </p>
        <p className="truncate text-sm text-foreground">{activeOrg.orgName}</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative border-b border-brand-line px-4 py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={handleBlur}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-brand-line bg-brand-elevated px-3 py-3 text-sm shadow-brand-panel transition-colors hover:bg-secondary"
      >
        <span className="truncate text-foreground">
          {activeOrg?.orgName ?? 'Select workspace'}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-brand-quiet transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <Card className="absolute left-4 right-4 top-full z-50 mt-2 overflow-hidden border-brand-line">
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
                <p className="text-xs capitalize text-brand-quiet">
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

function UserMenu({
  session,
  onSignOut,
  onNavigate,
}: {
  session: { user?: { name?: string | null; email?: string | null } } | null
  onSignOut: () => void
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const initials =
    session?.user?.name?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    '?'

  return (
    <div ref={ref} className="relative border-t border-brand-line px-4 py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-foreground/[0.04]"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-xs font-medium text-foreground">
          {initials}
        </div>
        <span className="truncate text-sm text-foreground">
          {session?.user?.name ?? 'User'}
        </span>
        <ChevronUp
          size={14}
          className={`ml-auto flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <Card className="absolute bottom-full left-4 right-4 z-50 mb-2 overflow-hidden border-border">
          <div className="px-3 py-3">
            <p className="truncate text-sm font-medium text-foreground">
              {session?.user?.name ?? 'User'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
          <div className="border-t border-border">
            <Link
              href="/settings"
              onClick={() => {
                setOpen(false)
                onNavigate()
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              <Settings size={16} />
              Settings
            </Link>
            <button
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/[0.04]"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
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
      <div className="border-b border-brand-line px-5 py-5">
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
              className={`h-11 w-full justify-start gap-3 rounded-2xl px-3 text-sm ${
                active
                  ? 'bg-foreground/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
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

      <UserMenu session={session} onSignOut={handleSignOut} onNavigate={() => setMobileOpen(false)} />
    </div>
  )

  return (
    <>
      <aside className="kodi-sidebar-surface sticky top-0 hidden h-screen w-72 flex-shrink-0 flex-col border-r border-brand-line md:flex">
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
          className="kodi-overlay-scrim fixed inset-0 z-40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`kodi-sidebar-surface fixed inset-y-0 left-0 z-50 w-72 border-r border-brand-line transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-4 top-4 p-1 text-brand-quiet hover:text-foreground"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {navContent}
      </aside>
    </>
  )
}
