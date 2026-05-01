'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookMarked,
  Building2,
  FileText,
  Folder,
  type LucideIcon,
  Loader2,
  RefreshCcw,
  UserRound,
} from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Skeleton } from '@kodi/ui/components/skeleton'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kodi/ui/components/tabs'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'

type MemoryScope = 'org' | 'member'
type MemoryManifest = Awaited<ReturnType<typeof trpc.memory.manifest.query>>
type MemoryDirectory = Awaited<
  ReturnType<typeof trpc.memory.listDirectory.query>
>

const scopeContent = {
  org: {
    label: 'Shared',
    shortLabel: 'Shared memory',
    eyebrow: 'Workspace memory',
    description:
      'Context Kodi can use in shared conversations, meetings, and team follow-up work.',
    empty: 'No shared root entries yet.',
    badge: 'Shared',
    icon: Building2,
  },
  member: {
    label: 'Private',
    shortLabel: 'Private memory',
    eyebrow: 'Member memory',
    description:
      'Context Kodi can use for your private assistant surfaces without exposing it to the team.',
    empty: 'No private root entries yet.',
    badge: 'Private',
    icon: UserRound,
  },
} satisfies Record<
  MemoryScope,
  {
    label: string
    shortLabel: string
    eyebrow: string
    description: string
    empty: string
    badge: string
    icon: LucideIcon
  }
>

function parseMemoryScope(value: string | null): MemoryScope {
  return value === 'member' ? 'member' : 'org'
}

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-0 text-xl font-semibold tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-6 border-t pt-5 text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-2 text-sm leading-6 text-foreground">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 space-y-1.5 pl-0 text-sm leading-6">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 text-foreground before:mt-2.5 before:size-1 before:shrink-0 before:rounded-full before:bg-muted-foreground/50">
      <span className="min-w-0">{children}</span>
    </li>
  ),
  code: ({ children }) => (
    <code className="rounded bg-secondary px-1 py-0.5 text-[0.85em] font-medium text-foreground">
      {children}
    </code>
  ),
} satisfies Components

function formatPathLabel(path: string) {
  if (!path) return 'Memory'
  return path.replace(/\.md$/i, '').replace(/[-_]+/g, ' ')
}

function formatDate(value: Date | number | string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function MemoryLoading() {
  return (
    <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="rounded-lg border bg-brand-elevated p-4">
        <Skeleton className="mb-4 h-4 w-28" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-brand-elevated p-6">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </div>
    </div>
  )
}

function DirectoryRow({
  entry,
}: {
  entry: MemoryDirectory['entries'][number]
}) {
  const Icon = entry.pathType === 'directory' ? Folder : FileText

  return (
    <div className="group flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:border-border hover:bg-secondary/60">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">
          {formatPathLabel(entry.name)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {entry.path}
        </div>
      </div>
      {entry.isIndex ? (
        <Badge variant="neutral" className="shrink-0">
          Index
        </Badge>
      ) : null}
    </div>
  )
}

function ManifestView({ manifest }: { manifest: MemoryManifest }) {
  return (
    <article className="min-h-[28rem] rounded-lg border bg-brand-elevated p-6 shadow-[0_22px_70px_-48px_hsl(var(--foreground)/0.35)]">
      <div className="mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookMarked className="size-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">
              {manifest.parsed.title}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {manifest.parsed.organizationSummary}
          </p>
        </div>
        <Badge variant="info" className="self-start">
          {manifest.scopeType === 'org' ? 'Shared' : 'Private'}
        </Badge>
      </div>

      <div className="max-w-none text-foreground">
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={[remarkGfm]}
        >
          {manifest.content}
        </ReactMarkdown>
      </div>
    </article>
  )
}

export function MemoryPage() {
  const { activeOrg } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = parseMemoryScope(searchParams.get('scope'))
  const [manifest, setManifest] = useState<MemoryManifest | null>(null)
  const [directory, setDirectory] = useState<MemoryDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeScope = scopeContent[scope]
  const ActiveScopeIcon = activeScope.icon

  const entryCount = directory?.entries.length ?? 0
  const lastUpdated = useMemo(() => {
    const entries = directory?.entries ?? []
    return entries
      .map((entry) => new Date(entry.lastUpdatedAt).getTime())
      .sort((left, right) => right - left)[0]
  }, [directory])

  async function loadMemory(orgId: string, nextScope: MemoryScope) {
    const [nextManifest, nextDirectory] = await Promise.all([
      trpc.memory.manifest.query({ orgId, scope: nextScope }),
      trpc.memory.listDirectory.query({ orgId, scope: nextScope }),
    ])
    setManifest(nextManifest)
    setDirectory(nextDirectory)
  }

  useEffect(() => {
    if (!activeOrg) {
      setManifest(null)
      setDirectory(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadMemory(activeOrg.orgId, scope)
      .catch((nextError) => {
        if (cancelled) return
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load memory.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId, scope])

  async function refresh() {
    if (!activeOrg || refreshing) return
    setRefreshing(true)
    setError(null)

    try {
      await loadMemory(activeOrg.orgId, scope)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to refresh memory.'
      )
    } finally {
      setRefreshing(false)
    }
  }

  function selectScope(nextScope: string) {
    if (nextScope !== 'org' && nextScope !== 'member') return

    const params = new URLSearchParams(searchParams.toString())
    if (nextScope === 'member') {
      params.set('scope', 'member')
    } else {
      params.delete('scope')
    }

    const query = params.toString()
    router.replace(`/memory${query ? `?${query}` : ''}`, { scroll: false })
  }

  if (!activeOrg) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Select a workspace to open memory.
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              <ActiveScopeIcon className="size-3.5" />
              {activeOrg.orgName} / {activeScope.eyebrow}
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Memory
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {activeScope.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={scope} onValueChange={selectScope}>
              <TabsList aria-label="Memory scope">
                <TabsTrigger value="org" className="gap-2">
                  <Building2 className="size-4" />
                  Shared
                </TabsTrigger>
                <TabsTrigger value="member" className="gap-2">
                  <UserRound className="size-4" />
                  Private
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="neutral">{entryCount} root items</Badge>
            {lastUpdated ? (
              <Badge variant="outline">Updated {formatDate(lastUpdated)}</Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={refreshing || loading}
            >
              {refreshing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 size-4" />
              )}
              Refresh
            </Button>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <MemoryLoading />
        ) : (
          <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[20rem_1fr]">
            <aside className="rounded-lg border bg-brand-elevated p-3">
              <div className="flex items-center justify-between px-2 py-2">
                <div>
                  <div className="text-sm font-semibold">
                    {activeScope.shortLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">Root</div>
                </div>
                <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <ActiveScopeIcon className="size-4" />
                </span>
              </div>

              <div className="mt-2 space-y-1">
                {(directory?.entries ?? []).length > 0 ? (
                  directory?.entries.map((entry) => (
                    <DirectoryRow key={entry.path} entry={entry} />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {activeScope.empty}
                  </div>
                )}
              </div>
            </aside>

            {manifest ? (
              <ManifestView manifest={manifest} />
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center rounded-lg border bg-brand-elevated p-6 text-sm text-muted-foreground">
                Memory manifest unavailable.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
