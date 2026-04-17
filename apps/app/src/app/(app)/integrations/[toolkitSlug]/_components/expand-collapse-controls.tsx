import { Button } from '@kodi/ui'

export function ExpandCollapseControls({
  onExpandAll,
  onCollapseAll,
}: {
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        className="border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={onExpandAll}
      >
        Expand all
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={onCollapseAll}
      >
        Collapse all
      </Button>
    </div>
  )
}
