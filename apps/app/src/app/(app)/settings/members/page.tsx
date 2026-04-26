'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { MemberList } from '../_components/member-list'
import { InviteForm } from '../_components/invite-form'
import { Users } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent } from '@kodi/ui/components/card'
import { Skeleton } from '@kodi/ui/components/skeleton'

type Member = {
  id: string
  userId: string
  name: string
  email: string
  image?: string | null
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
          <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
        </div>
      </SettingsLayout>
    )
  }

  if (error) {
    return (
      <SettingsLayout>
        <div className="py-10 text-center">
          <Alert variant="destructive" className="mx-auto max-w-md">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button
            onClick={() => {
              setError(null)
              setLoading(true)
              void refresh()
            }}
            variant="link"
            className="mt-3 text-sm text-muted-foreground hover:text-foreground"
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
        <div className="mx-auto max-w-2xl py-10">
          <Card className="rounded-2xl border-border">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">No organisation found.</p>
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
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-accent text-primary shadow-sm">
              <Users size={18} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Members
            </h1>
          </div>
          <p className="ml-[3.25rem] text-sm leading-7 text-muted-foreground">
            {members.length} member{members.length !== 1 ? 's' : ''} in{' '}
            {activeOrg.orgName}
          </p>
        </div>

        {isOwner && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-foreground">
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
          <h2 className="mb-3 text-sm font-medium text-foreground">
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
