'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  BookMarked,
  Building2,
  FileText,
  Folder,
  type LucideIcon,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Send,
  UserRound,
} from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { Textarea } from '@kodi/ui/components/textarea'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kodi/ui/components/tabs'
import { pageShellClass } from '@/lib/brand-styles'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import {
  basename,
  buildMemoryChatPrompt,
  buildMemoryChatUrl,
  buildMemoryUrl,
  buildScopeSwitchUrl,
  formatPathLabel,
  parentPath,
  parseMemoryScope,
  selectMemoryViewKind,
  type MemoryScope,
} from './memory-page-view-model'

type MemoryManifest = Awaited<ReturnType<typeof trpc.memory.manifest.query>>
type MemoryDirectory = Awaited<
  ReturnType<typeof trpc.memory.listDirectory.query>
>
type MemoryFile = Awaited<ReturnType<typeof trpc.memory.readPath.query>>

const scopeContent = {
  org: {
    shortLabel: 'Shared memory',
    eyebrow: 'Workspace memory',
    description:
      'Context Kodi can use in shared conversations, meetings, and team follow-up work.',
    empty: 'No shared root entries yet.',
    icon: Building2,
  },
  member: {
    shortLabel: 'Private memory',
    eyebrow: 'Member memory',
    description:
      'Context Kodi can use for your private assistant surfaces without exposing it to the team.',
    empty: 'No private root entries yet.',
    icon: UserRound,
  },
} satisfies Record<
  MemoryScope,
  {
    shortLabel: string
    eyebrow: string
    description: string
    empty: string
    icon: LucideIcon
  }
>

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
  active,
  onOpen,
}: {
  entry: MemoryDirectory['entries'][number]
  active: boolean
  onOpen: (entry: MemoryDirectory['entries'][number]) => void
}) {
  const Icon = entry.pathType === 'directory' ? Folder : FileText

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={`group flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-secondary/60 ${
        active
          ? 'border-border bg-secondary text-foreground'
          : 'border-transparent'
      }`}
    >
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
    </button>
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

function DirectoryView({
  directory,
  indexFile,
  onOpen,
}: {
  directory: MemoryDirectory
  indexFile: MemoryFile | null
  onOpen: (entry: MemoryDirectory['entries'][number]) => void
}) {
  return (
    <article className="min-h-[28rem] rounded-lg border bg-brand-elevated p-6 shadow-[0_22px_70px_-48px_hsl(var(--foreground)/0.35)]">
      <div className="mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Folder className="size-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">
              {directory.path ? formatPathLabel(basename(directory.path)) : 'Root'}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {directory.entries.length} item{directory.entries.length === 1 ? '' : 's'} in this location.
          </p>
        </div>
        <Badge variant="neutral" className="self-start">
          Directory
        </Badge>
      </div>

      {indexFile ? (
        <div className="mb-6 rounded-lg border bg-background p-4">
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm]}
          >
            {indexFile.content}
          </ReactMarkdown>
        </div>
      ) : null}

      <div className="grid gap-2">
        {directory.entries.length > 0 ? (
          directory.entries.map((entry) => (
            <DirectoryRow
              key={entry.path}
              entry={entry}
              active={false}
              onOpen={onOpen}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            This directory is empty.
          </div>
        )}
      </div>
    </article>
  )
}

function FileView({ file }: { file: MemoryFile }) {
  return (
    <article className="min-h-[28rem] rounded-lg border bg-brand-elevated p-6 shadow-[0_22px_70px_-48px_hsl(var(--foreground)/0.35)]">
      <div className="mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">
              {file.title ?? formatPathLabel(basename(file.path))}
            </h2>
          </div>
          <p className="max-w-2xl truncate text-sm leading-6 text-muted-foreground">
            {file.path}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {file.isIndex ? <Badge variant="neutral">Index</Badge> : null}
          <Badge variant="outline">Edited {formatDate(file.lastUpdatedAt)}</Badge>
        </div>
      </div>

      <div className="max-w-none text-foreground">
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={[remarkGfm]}
        >
          {file.content}
        </ReactMarkdown>
      </div>
    </article>
  )
}

function MemoryChatPanel({
  scope,
  path,
  activeOrgName,
  onSend,
}: {
  scope: MemoryScope
  path: string
  activeOrgName: string
  onSend: (prompt: string) => void
}) {
  const [draft, setDraft] = useState('')

  function submit() {
    const prompt = buildMemoryChatPrompt({
      activeOrgName,
      scope,
      path,
      question: draft,
    })
    if (!prompt) return
    onSend(prompt)
    setDraft('')
  }

  return (
    <aside className="rounded-lg border bg-brand-elevated p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <MessageSquare className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Ask about this memory</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Kodi will open in chat with this scope and path already included.
          </p>
        </div>
      </div>

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="What changed here?"
        className="mt-4 min-h-24 resize-none"
      />
      <Button
        type="button"
        size="sm"
        className="mt-3 w-full"
        onClick={submit}
        disabled={!draft.trim()}
      >
        <Send className="mr-2 size-4" />
        Ask Kodi
      </Button>
    </aside>
  )
}

export function MemoryPage() {
  const { activeOrg } = useOrg()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = parseMemoryScope(searchParams.get('scope'))
  const selectedPath = searchParams.get('path')?.trim() ?? ''
  const [manifest, setManifest] = useState<MemoryManifest | null>(null)
  const [directory, setDirectory] = useState<MemoryDirectory | null>(null)
  const [directoryIndex, setDirectoryIndex] = useState<MemoryFile | null>(null)
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null)
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
  const viewKind = selectMemoryViewKind({
    selectedPath,
    hasManifest: Boolean(manifest),
    hasDirectory: Boolean(directory),
    hasSelectedFile: Boolean(selectedFile),
  })

  async function loadDirectoryIndex(
    orgId: string,
    nextScope: MemoryScope,
    nextDirectory: MemoryDirectory
  ) {
    const indexEntry = nextDirectory.entries.find((entry) => entry.isIndex)
    if (!indexEntry) return null

    try {
      return await trpc.memory.readPath.query({
        orgId,
        scope: nextScope,
        path: indexEntry.path,
      })
    } catch {
      return null
    }
  }

  async function loadMemory(
    orgId: string,
    nextScope: MemoryScope,
    nextPath: string
  ) {
    const nextManifest = await trpc.memory.manifest.query({
      orgId,
      scope: nextScope,
    })
    let nextDirectory: MemoryDirectory
    let nextDirectoryIndex: MemoryFile | null = null
    let nextFile: MemoryFile | null = null

    if (!nextPath) {
      nextDirectory = await trpc.memory.listDirectory.query({
        orgId,
        scope: nextScope,
      })
      nextDirectoryIndex = await loadDirectoryIndex(
        orgId,
        nextScope,
        nextDirectory
      )
    } else {
      try {
        nextFile = await trpc.memory.readPath.query({
          orgId,
          scope: nextScope,
          path: nextPath,
        })
        nextDirectory = await trpc.memory.listDirectory.query({
          orgId,
          scope: nextScope,
          path: parentPath(nextPath),
        })
      } catch {
        nextDirectory = await trpc.memory.listDirectory.query({
          orgId,
          scope: nextScope,
          path: nextPath,
        })
        nextDirectoryIndex = await loadDirectoryIndex(
          orgId,
          nextScope,
          nextDirectory
        )
      }
    }

    setManifest(nextManifest)
    setDirectory(nextDirectory)
    setDirectoryIndex(nextDirectoryIndex)
    setSelectedFile(nextFile)
  }

  useEffect(() => {
    if (!activeOrg) {
      setManifest(null)
      setDirectory(null)
      setDirectoryIndex(null)
      setSelectedFile(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadMemory(activeOrg.orgId, scope, selectedPath)
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
  }, [activeOrg?.orgId, scope, selectedPath])

  async function refresh() {
    if (!activeOrg || refreshing) return
    setRefreshing(true)
    setError(null)

    try {
      await loadMemory(activeOrg.orgId, scope, selectedPath)
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

    router.replace(
      buildScopeSwitchUrl(searchParams.toString(), nextScope),
      { scroll: false }
    )
  }

  function openPath(path: string) {
    router.replace(buildMemoryUrl(scope, path), { scroll: false })
  }

  function openEntry(entry: MemoryDirectory['entries'][number]) {
    openPath(entry.path)
  }

  function openParent() {
    if (!selectedPath) return
    router.replace(buildMemoryUrl(scope, parentPath(selectedPath)), {
      scroll: false,
    })
  }

  function askKodi(prompt: string) {
    router.push(buildMemoryChatUrl(prompt))
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
              {selectedPath ? (
                <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => router.replace(buildMemoryUrl(scope), { scroll: false })}
                    className="rounded-md px-2 py-1 hover:bg-secondary hover:text-foreground"
                  >
                    Root
                  </button>
                  {selectedPath.split('/').map((segment, index, parts) => {
                    const path = parts.slice(0, index + 1).join('/')
                    const isLast = index === parts.length - 1
                    return (
                      <span key={path} className="flex items-center gap-2">
                        <span>/</span>
                        <button
                          type="button"
                          onClick={() => openPath(path)}
                          className={`rounded-md px-2 py-1 ${
                            isLast
                              ? 'bg-secondary text-foreground'
                              : 'hover:bg-secondary hover:text-foreground'
                          }`}
                        >
                          {formatPathLabel(segment)}
                        </button>
                      </span>
                    )
                  })}
                </div>
              ) : null}
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
          <div className="grid min-h-[32rem] gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_19rem]">
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
                <button
                  type="button"
                  onClick={() => router.replace(buildMemoryUrl(scope), { scroll: false })}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-secondary/60 ${
                    !selectedPath
                      ? 'border-border bg-secondary text-foreground'
                      : 'border-transparent'
                  }`}
                >
                  <BookMarked className="size-4 text-muted-foreground" />
                  <span className="font-medium">Memory root</span>
                </button>
                {selectedPath ? (
                  <button
                    type="button"
                    onClick={openParent}
                    className="flex min-h-10 w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" />
                    <span>Parent</span>
                  </button>
                ) : null}
                {(directory?.entries ?? []).length > 0 ? (
                  directory?.entries.map((entry) => (
                    <DirectoryRow
                      key={entry.path}
                      entry={entry}
                      active={entry.path === selectedPath}
                      onOpen={openEntry}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {activeScope.empty}
                  </div>
                )}
              </div>
            </aside>

            {viewKind === 'file' && selectedFile ? (
              <FileView file={selectedFile} />
            ) : viewKind === 'directory' && directory ? (
              <DirectoryView
                directory={directory}
                indexFile={directoryIndex}
                onOpen={openEntry}
              />
            ) : viewKind === 'manifest' && manifest ? (
              <ManifestView manifest={manifest} />
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center rounded-lg border bg-brand-elevated p-6 text-sm text-muted-foreground">
                Memory manifest unavailable.
              </div>
            )}

            <MemoryChatPanel
              scope={scope}
              path={selectedPath}
              activeOrgName={activeOrg.orgName}
              onSend={askKodi}
            />
          </div>
        )}
      </div>
    </div>
  )
}
