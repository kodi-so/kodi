import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db, orgMembers } from '@kodi/db'
import { eq } from 'drizzle-orm'
import { ChatInterface } from './_components/chat-interface'

export const metadata = {
  title: 'Chat — Kodi',
}

export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, session.user.id),
    with: { org: true },
  })

  if (!membership) redirect('/dashboard')

  return (
    <div className="flex flex-col h-full">
      <ChatInterface orgId={membership.orgId} />
    </div>
  )
}
