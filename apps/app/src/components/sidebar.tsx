'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Video,
  Link2,
  Settings,
  Menu,
  X,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { useOrg } from '@/lib/org-context'
import { Button, Card } from '@kodi/ui'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/meetings', label: 'Meetings', icon: Video },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
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
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-xs text-zinc-500 mb-0.5">Workspace</p>
        <p className="text-sm font-medium text-white truncate">
          {activeOrg.orgName}
        </p>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative px-3 py-2 border-b border-zinc-800">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={handleBlur}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm transition-colors hover:border-zinc-700"
      >
        <span className="text-white font-medium truncate">
          {activeOrg?.orgName ?? 'Select workspace'}
        </span>
        <ChevronDown
          size={14}
          className={`text-zinc-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <Card className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-xl border-zinc-700 bg-zinc-900 shadow-xl">
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onMouseDown={() => {
                setActiveOrg(org)
                setOpen(false)
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-zinc-800 transition-colors"
            >
              <div className="text-left min-w-0">
                <p className="text-white font-medium truncate">{org.orgName}</p>
                <p className="text-zinc-500 text-xs capitalize">{org.role}</p>
              </div>
              {org.orgId === activeOrg?.orgId && (
                <Check size={14} className="text-indigo-400 flex-shrink-0" />
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
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        <span className="text-white font-semibold text-lg tracking-tight">
          Kodi
        </span>
      </div>

      {/* Org switcher */}
      <OrgSwitcher />

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
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
              <Link href={href} onClick={() => setMobileOpen(false)}>
                <Icon size={18} />
                {label}
              </Link>
            </Button>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {session?.user?.name?.[0]?.toUpperCase() ??
                session?.user?.email?.[0]?.toUpperCase() ??
                '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {session?.user?.name ?? 'User'}
            </p>
            <p className="text-zinc-500 text-xs truncate">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSignOut}
          variant="ghost"
          className="w-full justify-center gap-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          Sign out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile: hamburger button */}
      <Button
        onClick={() => setMobileOpen(true)}
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </Button>

      {/* Mobile: drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile: drawer panel */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-60 bg-zinc-950 border-r border-zinc-800 transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-white"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {navContent}
      </aside>
    </>
  )
}
