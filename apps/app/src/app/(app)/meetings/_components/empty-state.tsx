import { Plus, Video } from 'lucide-react'
import { Button } from '@kodi/ui'

export function EmptyState({
  onStartMeeting,
}: {
  onStartMeeting: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground shadow-sm ring-1 ring-border">
        <Video size={22} />
      </div>
      <h3 className="mt-5 text-lg font-medium text-foreground">
        No meetings yet
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Start with a Google Meet or Zoom link. Kodi joins the call,
        captures everything, and turns it into a useful summary.
      </p>
      <Button
        className="mt-6 gap-2 shadow-soft"
        onClick={onStartMeeting}
      >
        <Plus size={15} />
        Start your first meeting
      </Button>
    </div>
  )
}
