'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  GitBranch,
  GripVertical,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kodi/ui/components/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@kodi/ui/components/sheet'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { Switch } from '@kodi/ui/components/switch'
import { Textarea } from '@kodi/ui/components/textarea'
import { pageShellClass, quietTextClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type BoardResult = Awaited<ReturnType<typeof trpc.work.board.query>>
type TaskCard = BoardResult['lanes'][number]['items'][number]
type TaskLane = BoardResult['lanes'][number]
type BoardView = BoardResult['activeView']

const VIEW_LABELS: Record<string, string> = {
  'assigned-to-kodi': 'Assigned to Kodi',
  'all-open': 'All open',
  'completed-by-kodi': 'Completed by Kodi',
  'meeting-derived': 'Meetings',
}

const executionTone: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  idle: 'outline',
  queued: 'secondary',
  awaiting_approval: 'secondary',
  running: 'secondary',
  succeeded: 'outline',
  failed: 'destructive',
}

const syncTone: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  local: 'outline',
  queued: 'secondary',
  syncing: 'secondary',
  healthy: 'outline',
  stale: 'secondary',
  blocked: 'destructive',
  error: 'destructive',
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [delayMs, value])
  return debounced
}

export function TasksBoard() {
  const { activeOrg } = useOrg()
  const [board, setBoard] = useState<BoardResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<BoardView>('assigned-to-kodi')
  const [searchDraft, setSearchDraft] = useState('')
  const debouncedSearch = useDebouncedValue(searchDraft, 200)
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'meeting' | 'manual' | 'chat' | 'import' | 'agent'>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickLinear, setQuickLinear] = useState(false)
  const [creating, setCreating] = useState(false)

  const orgId = activeOrg?.orgId ?? null

  const loadBoard = useCallback(async () => {
    if (!orgId) {
      setBoard(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await trpc.work.board.query({
        orgId,
        view: activeView,
        search: debouncedSearch || null,
        linked: linkedFilter,
        sourceType: sourceFilter,
        limitPerLane: 50,
      })
      setBoard(result)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to load tasks.'
      )
    } finally {
      setLoading(false)
    }
  }, [activeView, debouncedSearch, linkedFilter, orgId, sourceFilter])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  const lanes = board?.lanes ?? []
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    for (const lane of lanes) {
      const task = lane.items.find((item) => item.id === selectedTaskId)
      if (task) return task
    }
    return null
  }, [lanes, selectedTaskId])

  async function createQuickTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orgId || !quickTitle.trim() || creating) return
    setCreating(true)
    try {
      await trpc.work.create.mutate({
        orgId,
        title: quickTitle.trim(),
        assigneeType: 'kodi',
        sourceType: 'manual',
        trackInLinear: quickLinear,
      })
      setQuickTitle('')
      setQuickLinear(false)
      toast.success('Task created')
      await loadBoard()
    } catch (nextError) {
      toast.error(
        nextError instanceof Error ? nextError.message : 'Failed to create task.'
      )
    } finally {
      setCreating(false)
    }
  }

  async function moveTask(task: TaskCard, workflowStateId: string) {
    if (!orgId || task.workflowStateId === workflowStateId) return
    const previousBoard = board
    setMovingTaskId(task.id)
    setBoard((current) => optimisticMove(current, task.id, workflowStateId))
    try {
      await trpc.work.move.mutate({ orgId, workItemId: task.id, workflowStateId })
      await loadBoard()
    } catch (nextError) {
      setBoard(previousBoard)
      toast.error(
        nextError instanceof Error ? nextError.message : 'Failed to move task.'
      )
    } finally {
      setMovingTaskId(null)
      setDraggingTaskId(null)
    }
  }

  async function completeOrReopen(task: TaskCard) {
    if (!orgId) return
    setMovingTaskId(task.id)
    try {
      if (task.completedAt) {
        await trpc.work.reopen.mutate({ orgId, workItemId: task.id })
      } else {
        await trpc.work.complete.mutate({ orgId, workItemId: task.id, actorType: 'user' })
      }
      await loadBoard()
    } catch (nextError) {
      toast.error(
        nextError instanceof Error ? nextError.message : 'Failed to update task.'
      )
    } finally {
      setMovingTaskId(null)
    }
  }

  return (
    <div className={pageShellClass}>
      <div className="flex min-h-svh flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Kodi task board</p>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-foreground">
                Tasks
              </h1>
              <p className={`mt-1 max-w-2xl text-sm ${quietTextClass}`}>
                Work Kodi is carrying, reviewing, syncing, or finishing from meetings and manual capture.
              </p>
            </div>
          </div>

          <form
            onSubmit={createQuickTask}
            className="flex w-full flex-col gap-2 rounded-md border border-border bg-card p-2 sm:flex-row lg:max-w-2xl"
          >
            <div className="relative min-w-0 flex-1">
              <Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="Create a task for Kodi"
                className="h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              />
            </div>
            <label className="flex h-10 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground">
              <Switch checked={quickLinear} onCheckedChange={setQuickLinear} />
              Linear
            </label>
            <Button type="submit" disabled={!quickTitle.trim() || creating} className="h-10">
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>
        </header>

        <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-md border border-border bg-card p-1">
            {(board?.views ?? [
              { id: 'assigned-to-kodi', label: 'Assigned to Kodi' },
              { id: 'all-open', label: 'All open' },
              { id: 'completed-by-kodi', label: 'Completed by Kodi' },
              { id: 'meeting-derived', label: 'Meetings' },
            ]).map((view) => (
              <Button
                key={view.id}
                type="button"
                variant={activeView === view.id ? 'secondary' : 'ghost'}
                size="sm"
                className="shrink-0"
                onClick={() => setActiveView(view.id as BoardView)}
              >
                {VIEW_LABELS[view.id] ?? view.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_140px_140px_auto] lg:w-[680px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search tasks"
                className="pl-9"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as typeof sourceFilter)}>
              <SelectTrigger aria-label="Source filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="meeting">Meetings</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="import">Imports</SelectItem>
              </SelectContent>
            </Select>
            <Select value={linkedFilter} onValueChange={(value) => setLinkedFilter(value as typeof linkedFilter)}>
              <SelectTrigger aria-label="Linear link filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sync</SelectItem>
                <SelectItem value="linked">Linked</SelectItem>
                <SelectItem value="unlinked">Unlinked</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void loadBoard()}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <BoardSkeleton />
        ) : lanes.length === 0 || lanes.every((lane) => lane.items.length === 0) ? (
          <EmptyBoard />
        ) : (
          <>
            <div className="hidden min-h-[520px] gap-3 overflow-x-auto pb-4 lg:flex">
              {lanes.map((lane) => (
                <TaskLaneColumn
                  key={lane.state.id}
                  lane={lane}
                  lanes={lanes}
                  movingTaskId={movingTaskId}
                  draggingTaskId={draggingTaskId}
                  onDragStart={setDraggingTaskId}
                  onMove={moveTask}
                  onOpen={setSelectedTaskId}
                  onComplete={completeOrReopen}
                />
              ))}
            </div>

            <div className="space-y-4 lg:hidden">
              {lanes.map((lane) => (
                <section key={lane.state.id} className="space-y-2">
                  <LaneHeader lane={lane} />
                  <div className="space-y-2">
                    {lane.items.map((task) => (
                      <TaskCardButton
                        key={task.id}
                        task={task}
                        lanes={lanes}
                        movingTaskId={movingTaskId}
                        onOpen={setSelectedTaskId}
                        onMove={moveTask}
                        onComplete={completeOrReopen}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>

      <TaskDetailDrawer
        orgId={orgId}
        task={selectedTask}
        lanes={lanes}
        open={selectedTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null)
        }}
        onSaved={loadBoard}
      />
    </div>
  )
}

function TaskLaneColumn({
  lane,
  lanes,
  movingTaskId,
  draggingTaskId,
  onDragStart,
  onMove,
  onOpen,
  onComplete,
}: {
  lane: TaskLane
  lanes: TaskLane[]
  movingTaskId: string | null
  draggingTaskId: string | null
  onDragStart: (taskId: string | null) => void
  onMove: (task: TaskCard, workflowStateId: string) => Promise<void>
  onOpen: (taskId: string) => void
  onComplete: (task: TaskCard) => Promise<void>
}) {
  return (
    <section
      className="flex w-[310px] shrink-0 flex-col rounded-md border border-border bg-secondary/40"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId
        const task = lanes.flatMap((current) => current.items).find((item) => item.id === taskId)
        if (task) void onMove(task, lane.state.id)
      }}
    >
      <LaneHeader lane={lane} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {lane.items.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Empty
          </div>
        ) : (
          lane.items.map((task) => (
            <TaskCardButton
              key={task.id}
              task={task}
              lanes={lanes}
              movingTaskId={movingTaskId}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', task.id)
                onDragStart(task.id)
              }}
              onDragEnd={() => onDragStart(null)}
              onOpen={onOpen}
              onMove={onMove}
              onComplete={onComplete}
            />
          ))
        )}
        {lane.hasMore ? (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            More hidden to keep this lane responsive.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function LaneHeader({ lane }: { lane: TaskLane }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-border px-3">
      <div className="flex min-w-0 items-center gap-2">
        <StateDot type={lane.state.type} />
        <h2 className="truncate text-sm font-medium">{lane.state.name}</h2>
      </div>
      <Badge variant="outline" className="shrink-0">
        {lane.count}
      </Badge>
    </div>
  )
}

function TaskCardButton({
  task,
  lanes,
  movingTaskId,
  draggable,
  onDragStart,
  onDragEnd,
  onOpen,
  onMove,
  onComplete,
}: {
  task: TaskCard
  lanes: TaskLane[]
  movingTaskId: string | null
  draggable?: boolean
  onDragStart?: React.DragEventHandler<HTMLElement>
  onDragEnd?: React.DragEventHandler<HTMLElement>
  onOpen: (taskId: string) => void
  onMove: (task: TaskCard, workflowStateId: string) => Promise<void>
  onComplete: (task: TaskCard) => Promise<void>
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group rounded-md border border-border bg-card p-3 shadow-sm transition-colors hover:border-foreground/20"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground group-hover:block" />
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="min-w-0 flex-1 text-left"
        >
          <h3 className="line-clamp-2 text-sm font-medium leading-5">{task.title}</h3>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {task.description}
            </p>
          ) : null}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <AssigneeBadge task={task} />
        <Badge variant={executionTone[task.executionState] ?? 'outline'} className="capitalize">
          {humanize(task.executionState)}
        </Badge>
        <Badge variant={syncTone[task.syncState] ?? 'outline'} className="capitalize">
          {task.linkedExternalSystem ? task.linkedExternalSystem : humanize(task.syncState)}
        </Badge>
        {task.dueAt ? (
          <Badge variant="outline">
            <Calendar className="mr-1 size-3" />
            {formatDate(task.dueAt)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Select
          value={task.workflowStateId ?? ''}
          onValueChange={(value) => void onMove(task, value)}
          disabled={movingTaskId === task.id}
        >
          <SelectTrigger aria-label="Move task" className="h-8 min-w-0 text-xs">
            <SelectValue placeholder="Move" />
          </SelectTrigger>
          <SelectContent>
            {lanes.map((lane) => (
              <SelectItem key={lane.state.id} value={lane.state.id}>
                {lane.state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2"
          onClick={() => void onComplete(task)}
          disabled={movingTaskId === task.id}
        >
          {task.completedAt ? <RefreshCw className="size-4" /> : <CheckCircle2 className="size-4" />}
        </Button>
      </div>
    </article>
  )
}

function AssigneeBadge({ task }: { task: TaskCard }) {
  if (task.assigneeType === 'kodi') {
    return (
      <Badge variant="secondary">
        <Bot className="mr-1 size-3" />
        Kodi
      </Badge>
    )
  }

  if (task.assigneeUser) {
    return (
      <Badge variant="outline">
        <User className="mr-1 size-3" />
        {task.assigneeUser.name ?? task.assigneeUser.email ?? 'User'}
      </Badge>
    )
  }

  return <Badge variant="outline">Unassigned</Badge>
}

function StateDot({ type }: { type: string }) {
  const className =
    type === 'completed'
      ? 'text-emerald-600'
      : type === 'canceled'
        ? 'text-muted-foreground'
        : type === 'blocked'
          ? 'text-destructive'
          : type === 'started'
            ? 'text-blue-600'
            : 'text-amber-600'

  return type === 'completed' ? (
    <CheckCircle2 className={`size-4 ${className}`} />
  ) : (
    <Circle className={`size-4 ${className}`} />
  )
}

function TaskDetailDrawer({
  orgId,
  task,
  lanes,
  open,
  onOpenChange,
  onSaved,
}: {
  orgId: string | null
  task: TaskCard | null
  lanes: TaskLane[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof trpc.work.detail.query>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setDueAt(task?.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : '')
  }, [task?.description, task?.dueAt, task?.id, task?.title])

  useEffect(() => {
    if (!open || !orgId || !task) {
      setDetail(null)
      return
    }
    setLoading(true)
    trpc.work.detail
      .query({ orgId, workItemId: task.id })
      .then(setDetail)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load task detail.')
      })
      .finally(() => setLoading(false))
  }, [open, orgId, task])

  async function saveTask() {
    if (!orgId || !task || saving) return
    setSaving(true)
    try {
      await trpc.work.update.mutate({
        orgId,
        workItemId: task.id,
        title,
        description: description.trim() ? description : null,
        dueAt: dueAt ? new Date(`${dueAt}T12:00:00.000Z`).toISOString() : null,
      })
      toast.success('Task saved')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-left">
            <GitBranch className="size-5 text-muted-foreground" />
            Task detail
          </SheetTitle>
        </SheetHeader>

        {!task ? null : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="task-title">Title</Label>
                  <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-description">Description</Label>
                  <Textarea
                    id="task-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Workflow</Label>
                    <Select
                      value={task.workflowStateId ?? ''}
                      onValueChange={async (value) => {
                        if (!orgId) return
                        await trpc.work.move.mutate({ orgId, workItemId: task.id, workflowStateId: value })
                        await onSaved()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lanes.map((lane) => (
                          <SelectItem key={lane.state.id} value={lane.state.id}>
                            {lane.state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-due">Due date</Label>
                    <Input id="task-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                  </div>
                </div>
                <Button type="button" onClick={() => void saveTask()} disabled={saving || !title.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Save changes
                </Button>
              </div>

              <section className="grid gap-2 sm:grid-cols-2">
                <InfoRow icon={<Bot className="size-4" />} label="Assignee" value={task.assigneeType === 'kodi' ? 'Kodi' : task.assigneeUser?.email ?? 'Unassigned'} />
                <InfoRow icon={<ShieldCheck className="size-4" />} label="Review" value={humanize(task.reviewState)} />
                <InfoRow icon={<ArrowRight className="size-4" />} label="Execution" value={humanize(task.executionState)} />
                <InfoRow icon={<RefreshCw className="size-4" />} label="Sync" value={task.lastSyncError ?? humanize(task.syncState)} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Source</h3>
                <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="capitalize text-muted-foreground">{task.sourceType}</span>
                    {task.meetingSessionId ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/meetings/${task.meetingSessionId}`}>
                          Meeting
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Linear link</h3>
                <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                  {task.linkedExternalUrl ? (
                    <a
                      href={task.linkedExternalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-foreground underline-offset-4 hover:underline"
                    >
                      {task.linkedExternalId ?? 'Open linked issue'}
                      <ExternalLink className="size-4" />
                    </a>
                  ) : (
                    <p className="text-muted-foreground">
                      Local task. Track in Linear from quick create or meeting sync.
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Timeline</h3>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : detail?.activities.length ? (
                  <div className="space-y-2">
                    {detail.activities.map((event) => (
                      <div key={event.id} className="rounded-md border border-border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium capitalize">{humanize(event.eventType)}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                        </div>
                        {event.summary ? (
                          <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    No task activity yet.
                  </p>
                )}
              </section>

              {detail ? (
                <section className="grid gap-3 sm:grid-cols-2">
                  <OperationalList title="Approvals" items={detail.approvals.map((item) => `${item.status} - ${item.action ?? item.approvalType}`)} />
                  <OperationalList title="Tool runs" items={detail.runs.map((item) => `${item.status} - ${item.action ?? item.toolkitSlug ?? 'run'}`)} />
                </section>
              ) : null}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-medium capitalize">{value}</p>
    </div>
  )
}

function OperationalList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          None
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-md border border-border px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyBoard() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-6 text-center">
      <div className="max-w-sm space-y-3">
        <Bot className="mx-auto size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No tasks in this view</h2>
        <p className="text-sm text-muted-foreground">
          Create a task for Kodi or switch views to inspect completed and meeting-derived work.
        </p>
      </div>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="hidden gap-3 lg:flex">
      {Array.from({ length: 5 }).map((_, laneIndex) => (
        <div key={laneIndex} className="w-[310px] shrink-0 rounded-md border border-border bg-secondary/40 p-2">
          <Skeleton className="mb-3 h-7 w-32" />
          {Array.from({ length: 3 }).map((__, cardIndex) => (
            <Skeleton key={cardIndex} className="mb-2 h-32 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  )
}

function optimisticMove(
  board: BoardResult | null,
  taskId: string,
  workflowStateId: string
): BoardResult | null {
  if (!board) return board
  let movedTask: TaskCard | null = null
  const lanes = board.lanes.map((lane) => {
    const items = lane.items.filter((task) => {
      if (task.id === taskId) {
        movedTask = { ...task, workflowStateId }
        return false
      }
      return true
    })
    return {
      ...lane,
      count: lane.items.length === items.length ? lane.count : Math.max(0, lane.count - 1),
      items,
    }
  })

  if (!movedTask) return board

  return {
    ...board,
    lanes: lanes.map((lane) =>
      lane.state.id === workflowStateId
        ? { ...lane, count: lane.count + 1, items: [movedTask!, ...lane.items] }
        : lane
    ),
  }
}
