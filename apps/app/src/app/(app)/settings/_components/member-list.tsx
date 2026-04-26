'use client'

import { useState } from 'react'
import { RemoveMemberDialog } from './remove-member-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@kodi/ui/components/avatar'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent } from '@kodi/ui/components/card'

type Member = {
  id: string
  userId: string
  name: string
  email: string
  image?: string | null
  role: 'owner' | 'member'
  joinedAt: Date | string
}

interface MemberListProps {
  members: Member[]
  currentUserId: string
  currentUserRole: 'owner' | 'member'
  orgId: string
  orgName: string
  onMemberRemoved: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
  orgId,
  orgName,
  onMemberRemoved,
}: MemberListProps) {
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)

  const isOwner = currentUserRole === 'owner'

  return (
    <>
      <Card className="overflow-hidden rounded-xl border-border">
        <CardContent className="divide-y divide-border p-0">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId
            const canRemove = isOwner && !isSelf && member.role !== 'owner'

            return (
              <div
                key={member.id}
                className="flex items-center gap-4 bg-transparent px-5 py-4 transition-colors hover:bg-brand-muted"
              >
                <Avatar className="h-9 w-9 flex-shrink-0 border border-border">
                  {member.image ? (
                    <AvatarImage
                      src={member.image}
                      alt={member.name}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="text-xs font-bold text-foreground">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.name}
                    {isSelf && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </div>

                <p className="hidden flex-shrink-0 text-xs text-muted-foreground sm:block">
                  Joined {formatDate(member.joinedAt)}
                </p>

                {member.role === 'owner' ? (
                  <Badge
                    variant="neutral"
                    className="flex-shrink-0 border-accent bg-accent text-primary hover:bg-accent"
                  >
                    Owner
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="flex-shrink-0">
                    Member
                  </Badge>
                )}

                {isOwner && (
                  <Button
                    onClick={() => canRemove && setRemoveTarget(member)}
                    disabled={!canRemove}
                    title={
                      isSelf
                        ? 'Cannot remove yourself'
                        : member.role === 'owner'
                          ? 'Cannot remove org owner'
                          : `Remove ${member.name}`
                    }
                    variant="outline"
                    size="sm"
                    className={`flex-shrink-0 text-xs ${
                      canRemove
                        ? 'border-border text-muted-foreground hover:border-brand-danger hover:bg-brand-danger-soft hover:text-brand-danger'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )
          })}

          {members.length === 0 && (
            <div className="bg-transparent px-5 py-10 text-center text-sm text-muted-foreground">
              No members yet.
            </div>
          )}
        </CardContent>
      </Card>

      {removeTarget && (
        <RemoveMemberDialog
          member={removeTarget}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            setRemoveTarget(null)
            onMemberRemoved()
          }}
        />
      )}
    </>
  )
}
