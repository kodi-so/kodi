'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
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
import { Button, Card } from '@kodi/ui'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
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

  const handleBlur = () => setTimeout(() => setOpen(false), 150)

  if (orgs.length === 0) return null

  if (orgs.length === 1 && activeOrg) {
    return (
      <div className="border-b border-white/10 px-4 py-3">
        <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#8da2a7]">
          Workspace
        </p>
        <p className="truncate text-sm text-white">{activeOrg.orgName}</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative border-b border-white/10 px-3 py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={handleBlur}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm transition-colors hover:border-white/18 hover:bg-white/8"
      >
        <span className="truncate text-white">
          {activeOrg?.orgName ?? 'Select workspace'}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-[#9bb0b5] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <Card className="absolute left-3 right-3 top-full z-50 mt-2 overflow-hidden rounded-2xl border-white/10 bg-[#314247] shadow-[0_22px_50px_rgba(8,13,16,0.28)]">
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onMouseDown={() => {
                setActiveOrg(org)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-sm transition-colors hover:bg-white/8"
            >
              <div className="min-w-0 text-left">
                <p className="truncate text-white">{org.orgName}</p>
                <p className="text-xs capitalize text-[#9bb0b5]">{org.role}</p>
              </div>
              {org.orgId === activeOrg?.orgId && (
                <Check size={14} className="flex-shrink-0 text-[#F0C570]" />
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
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/88 shadow-[0_14px_28px_rgba(8,13,16,0.18)]">
            <Image
              src="/brand/kodi-logo.png"
              alt=""
              width={32}
              height={32}
              className="h-auto w-7 object-contain"
            />
          </span>
          <div className="min-w-0">
            <span className="block font-brand text-lg tracking-[-0.05em] text-white">
              Kodi
            </span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-[#8ea3a8]">
              Control room
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="rounded-[1.35rem] border border-[#DFAE56]/18 bg-[linear-gradient(180deg,rgba(223,174,86,0.2),rgba(223,174,86,0.08))] px-4 py-3 text-[#223239]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#7a6030]">
            Delegation
          </p>
          <p className="mt-2 text-sm leading-6">
            Kodi can draft, request approval, or execute work based on your
            workspace guardrails.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <OrgSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Button
              key={href}
              asChild
              variant={active ? 'secondary' : 'ghost'}
              className={`w-full justify-start gap-3 rounded-2xl px-3 py-3 text-sm ${
                active
                  ? 'border border-[#DFAE56]/25 bg-[#DFAE56]/14 text-[#F6D18A] hover:bg-[#DFAE56]/18 hover:text-[#F9D896]'
                  : 'text-[#9eb1b5] hover:bg-white/6 hover:text-white'
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

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 flex items-center gap-3 rounded-[1.25rem] bg-white/5 px-3 py-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#DFAE56] text-xs font-semibold text-[#223239]">
            {session?.user?.name?.[0]?.toUpperCase() ??
              session?.user?.email?.[0]?.toUpperCase() ??
              '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">
              {session?.user?.name ?? 'User'}
            </p>
            <p className="truncate text-xs text-[#93a7ac]">
              {session?.user?.email}
            </p>
          </div>
        </div>

        <Button
          onClick={handleSignOut}
          variant="ghost"
          className="w-full justify-center gap-2 rounded-2xl text-[#9eb1b5] hover:bg-white/6 hover:text-white"
        >
          Sign out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-white/10 bg-[linear-gradient(180deg,rgba(34,50,57,0.98),rgba(27,40,45,0.98))] md:flex">
        {navContent}
      </aside>

      <Button
        onClick={() => setMobileOpen(true)}
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 rounded-full border-white/12 bg-[#223239]/92 text-[#d7e1e3] backdrop-blur md:hidden hover:bg-[#2a3d43] hover:text-white"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#152126]/72 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[linear-gradient(180deg,rgba(34,50,57,0.98),rgba(27,40,45,0.98))] transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-4 top-4 p-1 text-[#8da2a7] hover:text-white"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {navContent}
      </aside>
    </>
  )
}
