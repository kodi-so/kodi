'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { MemberList } from '../_components/member-list'
import { InviteForm } from '../_components/invite-form'
import { Users } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Skeleton,
} from '@kodi/ui'

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
  const { activeOrg } = useOrg()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/get-session', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as Session | null
        setSession(data)
      }
    } catch {
      // session stays null
    }
  }, [])

  const fetchData = useCallback(async (orgId: string, role: string) => {
    try {
      const membersData = await trpc.org.getMembers.query({ orgId })
      setMembers(
        membersData.map((m) => ({ ...m, role: m.role as 'owner' | 'member' }))
      )
      if (role === 'owner') {
        const invitesData = await trpc.invite.getActive.query({ orgId })
        setPendingInvites(invitesData)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    }
  }, [])

  useEffect(() => {
    if (!activeOrg) return
    setLoading(true)
    setError(null)
    void Promise.all([
      fetchSession(),
      fetchData(activeOrg.orgId, activeOrg.role),
    ]).finally(() => setLoading(false))
  }, [activeOrg, fetchSession, fetchData])

  const refresh = useCallback(async () => {
    if (!activeOrg) return
    await fetchData(activeOrg.orgId, activeOrg.role)
  }, [activeOrg, fetchData])

  if (loading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-white/10" />
        </div>
      </SettingsLayout>
    )
  }

  if (error) {
    return (
      <SettingsLayout>
        <div className="py-10 text-center">
          <Alert
            variant="destructive"
            className="mx-auto max-w-md border-red-500/20 bg-red-500/10 text-red-400"
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button
            onClick={() => {
              setError(null)
              setLoading(true)
              void refresh()
            }}
            variant="link"
            className="mt-3 text-sm text-[#9bb0b5] hover:text-white"
          >
            Retry
          </Button>
        </div>
      </SettingsLayout>
    )
  }

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="max-w-2xl mx-auto py-10">
          <Card className="rounded-2xl border-white/10 bg-[rgba(49,66,71,0.78)]">
            <CardContent className="p-6">
              <p className="text-sm text-[#9bb0b5]">No organisation found.</p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    )
  }

  const isOwner = activeOrg.role === 'owner'
  const currentUserId = session?.user?.id ?? ''

  return (
    <SettingsLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DFAE56]/22 bg-[#DFAE56]/12">
              <Users size={16} className="text-[#F0C570]" />
            </div>
            <h1 className="text-xl font-semibold text-white">Members</h1>
          </div>
          <p className="ml-11 text-sm text-[#8ea3a8]">
            {members.length} member{members.length !== 1 ? 's' : ''} in{' '}
            {activeOrg.orgName}
          </p>
        </div>

        {isOwner && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-[#dce5e7]">
              Invite a teammate
            </h2>
            <InviteForm
              orgId={activeOrg.orgId}
              pendingInvites={pendingInvites}
              onInviteSent={refresh}
              onInviteRevoked={refresh}
            />
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium text-[#dce5e7]">
            {isOwner ? 'Current members' : 'Team members'}
          </h2>
          <MemberList
            members={members}
            currentUserId={currentUserId}
            currentUserRole={activeOrg.role as 'owner' | 'member'}
            orgId={activeOrg.orgId}
            orgName={activeOrg.orgName}
            onMemberRemoved={refresh}
          />
        </section>
      </div>
    </SettingsLayout>
  )
}
