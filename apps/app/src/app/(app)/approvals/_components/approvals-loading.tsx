import { Skeleton } from '@kodi/ui'

export function ApprovalsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-[1.6rem]" />
      <Skeleton className="h-40 rounded-[1.6rem]" />
    </div>
  )
}
