'use client'

import { useSession, signOut } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AppPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login')
    }
  }, [session, isPending, router])

  if (isPending) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Kodi</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-zinc-400">
            {session.user.email}
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Dashboard */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Welcome back, {session.user.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-zinc-400 text-lg">Here's what's happening with your workspace today.</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          {[
            { label: 'Active Projects', value: '0', icon: '📁' },
            { label: 'Open Tasks', value: '0', icon: '✅' },
            { label: 'Team Members', value: '1', icon: '👥' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="text-2xl mb-3">{stat.icon}</div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-zinc-500 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
            🚀
          </div>
          <h2 className="text-xl font-semibold mb-2">Create your first project</h2>
          <p className="text-zinc-500 text-sm max-w-sm mx-auto mb-6">
            Get your team aligned by setting up your first project. It only takes a minute.
          </p>
          <button className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity">
            New Project
          </button>
        </div>
      </main>
    </div>
  )
}
