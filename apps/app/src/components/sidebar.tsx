'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Settings, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

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
        <span className="text-white font-semibold text-lg tracking-tight">Kodi</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {session?.user?.name ?? 'User'}
            </p>
            <p className="text-zinc-500 text-xs truncate">{session?.user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-zinc-400 text-sm hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Sign out
        </button>
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
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

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
