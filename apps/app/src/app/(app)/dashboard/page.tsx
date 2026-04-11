import { redirect } from 'next/navigation'

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { thread?: string }
}) {
  const params = new URLSearchParams()
  params.set('dm', 'kodi')

  if (searchParams?.thread) {
    params.set('thread', searchParams.thread)
  }

  redirect(`/chat?${params.toString()}`)
}
