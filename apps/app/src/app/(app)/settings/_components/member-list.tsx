'use client'

import { useState } from 'react'
import { RemoveMemberDialog } from './remove-member-dialog'
import { Badge, Button, Card, CardContent } from '@kodi/ui'

type Member = {
  id: string
  userId: string
  name: string
  email: string
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
      <Card className="overflow-hidden rounded-xl border-white/10 bg-[rgba(49,66,71,0.78)]">
        <CardContent className="divide-y divide-white/10 p-0">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId
            const canRemove = isOwner && !isSelf && member.role !== 'owner'

            return (
              <div
                key={member.id}
                className="flex items-center gap-4 bg-transparent px-5 py-4 transition-colors hover:bg-white/6"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#DFAE56] to-[#6FA88C]">
                  <span className="text-white text-xs font-bold">
                    {getInitials(member.name)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {member.name}
                    {isSelf && (
                      <span className="ml-1 font-normal text-[#8ea3a8]">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs truncate text-[#8ea3a8]">
                    {member.email}
                  </p>
                </div>

                <p className="hidden flex-shrink-0 text-xs text-[#8ea3a8] sm:block">
                  Joined {formatDate(member.joinedAt)}
                </p>

                {member.role === 'owner' ? (
                  <Badge className="flex-shrink-0 border border-[#DFAE56]/24 bg-[#DFAE56]/14 text-[#F0C570] hover:bg-[#DFAE56]/14">
                    Owner
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="flex-shrink-0 border-white/12 bg-white/8 text-[#9bb0b5]"
                  >
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
                        ? 'border-white/12 text-[#9bb0b5] hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400'
                        : 'border-white/10 text-[#7d9196]'
                    }`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )
          })}

          {members.length === 0 && (
            <div className="bg-transparent px-5 py-10 text-center text-sm text-[#8ea3a8]">
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
