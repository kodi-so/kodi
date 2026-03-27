'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { SettingsLayout } from '../_components/settings-layout'
import { MemberList } from '../_components/member-list'
import { InviteForm } from '../_components/invite-form'
import { Users } from 'lucide-react'

type OrgInfo = {
  orgId: string
  orgName: string
  orgSlug: string
  role: 'owner' | 'member'
}

type Member = {
  id: string
  userId: string
  name: string
  email: string
  role: 'owner' | 'member'
  joinedAt: Date | string
}

type PendingInvite = {
  id: string
  email: string
  expiresAt: Date | string
}

type Session = {
  user: { id: string; email: string; name: string }
}

export default function MembersPage() {
  const router = useRouter()
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch session from better-auth
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as Session | null
        setSession(data)
      }
    } catch {
      // session stays null
    }
  }, [])

  const fetchData = useCallback(async (org: OrgInfo) => {
    try {
      const membersData = await trpc.org.getMembers.query({ orgId: org.orgId })
      setMembers(
        membersData.map((m) => ({
          ...m,
          role: m.role as 'owner' | 'member',
        }))
      )

      if (org.role === 'owner') {
        const invitesData = await trpc.invite.getActive.query({ orgId: org.orgId })
        setPendingInvites(invitesData)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load members'
      setError(msg)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await fetchSession()
        const org = await trpc.org.getMyCurrent.query()
        if (org) {
          setOrgInfo(org as OrgInfo)
          await fetchData(org as OrgInfo)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load page'
        setError(msg)
      } finally {
        setLoading(false)
      }
    })()
  }, [router, fetchSession, fetchData])

  const refresh = useCallback(async () => {
    if (!orgInfo) return
    await fetchData(orgInfo)
  }, [orgInfo, fetchData])

  if (loading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      </SettingsLayout>
    )
  }

  if (error) {
    return (
      <SettingsLayout>
        <div className="py-10 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); router.refresh() }}
            className="mt-3 text-sm text-zinc-400 hover:text-white underline"
          >
            Retry
          </button>
        </div>
      </SettingsLayout>
    )
  }

  if (!orgInfo) {
    return (
      <SettingsLayout>
        <div className="max-w-2xl mx-auto py-10">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h1 className="text-xl font-semibold text-white mb-2">Members</h1>
            <p className="text-zinc-400 text-sm">
              Onboarding is temporarily disabled, and this account does not have an organization yet.
              Invite and member management will become available once an organization exists.
            </p>
          </div>
        </div>
      </SettingsLayout>
    )
  }

  const isOwner = orgInfo.role === 'owner'
  const currentUserId = session?.user?.id ?? ''

  return (
    <SettingsLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Users size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-xl font-semibold text-white">Members</h1>
          </div>
          <p className="text-zinc-500 text-sm ml-11">
            {members.length} member{members.length !== 1 ? 's' : ''} in {orgInfo.orgName}
          </p>
        </div>

        {/* Invite section — owners only */}
        {isOwner && (
          <section>
            <h2 className="text-sm font-medium text-zinc-300 mb-3">Invite a teammate</h2>
            <InviteForm
              orgId={orgInfo.orgId}
              pendingInvites={pendingInvites}
              onInviteSent={refresh}
              onInviteRevoked={refresh}
            />
          </section>
        )}

        {/* Member list */}
        <section>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">
            {isOwner ? 'Current members' : 'Team members'}
          </h2>
          <MemberList
            members={members}
            currentUserId={currentUserId}
            currentUserRole={orgInfo.role}
            orgId={orgInfo.orgId}
            orgName={orgInfo.orgName}
            onMemberRemoved={refresh}
          />
        </section>
      </div>
    </SettingsLayout>
  )
}
