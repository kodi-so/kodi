'use client'

import { useState } from 'react'
import { RemoveMemberDialog } from './remove-member-dialog'

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 overflow-hidden">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId
          const canRemove = isOwner && !isSelf && member.role !== 'owner'

          return (
            <div
              key={member.id}
              className="flex items-center gap-4 px-5 py-4 bg-zinc-900 hover:bg-zinc-800/50 transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{getInitials(member.name)}</span>
              </div>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {member.name}
                  {isSelf && <span className="text-zinc-500 font-normal ml-1">(you)</span>}
                </p>
                <p className="text-zinc-500 text-xs truncate">{member.email}</p>
              </div>

              {/* Join date */}
              <p className="text-zinc-500 text-xs hidden sm:block flex-shrink-0">
                Joined {formatDate(member.joinedAt)}
              </p>

              {/* Role badge */}
              {member.role === 'owner' ? (
                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 flex-shrink-0">
                  Owner
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0">
                  Member
                </span>
              )}

              {/* Remove button — owner only, not self */}
              {isOwner && (
                <button
                  onClick={() => canRemove && setRemoveTarget(member)}
                  disabled={!canRemove}
                  title={isSelf ? 'Cannot remove yourself' : member.role === 'owner' ? 'Cannot remove org owner' : `Remove ${member.name}`}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                    canRemove
                      ? 'border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 cursor-pointer'
                      : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  Remove
                </button>
              )}
            </div>
          )
        })}

        {members.length === 0 && (
          <div className="px-5 py-10 text-center text-zinc-500 text-sm bg-zinc-900">
            No members yet.
          </div>
        )}
      </div>

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
