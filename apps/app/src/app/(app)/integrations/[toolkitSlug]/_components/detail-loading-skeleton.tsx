import { Skeleton } from '@kodi/ui'
import {
  dashedPanelClass,
  quietTextClass,
} from '@/lib/brand-styles'

export function DetailLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 rounded-xl bg-brand-muted" />
      <Skeleton className="h-72 rounded-xl bg-brand-muted" />
      <Skeleton className="h-[28rem] rounded-xl bg-brand-muted" />
    </div>
  )
}

export function DetailNotFound() {
  return (
    <div className={`${dashedPanelClass} rounded-xl p-8`}>
      <p className="text-xl font-medium text-foreground">
        This integration could not be loaded.
      </p>
      <p className={`mt-2 max-w-xl text-sm leading-7 ${quietTextClass}`}>
        Go back to the catalog and pick another integration, or refresh if
        the connection state just changed.
      </p>
    </div>
  )
}
