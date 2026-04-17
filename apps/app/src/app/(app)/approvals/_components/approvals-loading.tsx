'use client'

import { Skeleton } from '@kodi/ui/components/skeleton'

export function ApprovalsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
