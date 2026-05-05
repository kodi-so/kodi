'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { cn } from '@kodi/ui/lib/utils'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'
import {
  COMING_SOON_TOOLS,
  ROLE_RECOMMENDATIONS,
  ROLES,
} from '../lib/role-recommendations'

type CatalogItem = {
  slug: string
  name: string
  description: string | null
  logo: string | null
  supportTier: string
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function ToolsPickStep() {
  const router = useRouter()
  const { orgId, setSelectedToolSlugs, isReady } = useOnboarding()

  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  // checkedSlugs: the full set of currently checked slugs
  const [checkedSlugs, setCheckedSlugs] = useState<Set<string>>(new Set())
  // manualUnchecked: slugs the user explicitly unchecked (won't be re-added by role change)
  const [manualUnchecked, setManualUnchecked] = useState<Set<string>>(new Set())
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery, 200)
  const [submitting, setSubmitting] = useState(false)

  // Missing integration capture
  const [missingToolName, setMissingToolName] = useState('')
  const [missingSubmitting, setMissingSubmitting] = useState(false)
  const [missingSubmitted, setMissingSubmitted] = useState<string | null>(null)

  const loadedOrgId = useRef('')

  const fetchCatalog = useCallback(
    async (search?: string) => {
      if (!orgId) return
      setLoadingCatalog(true)
      setCatalogError(false)
      try {
        const result = await trpc.toolAccess.getCatalog.query({
          orgId,
          search: search?.trim() || undefined,
          limit: 60,
        })
        setCatalog(result.items)
      } catch {
        setCatalogError(true)
      } finally {
        setLoadingCatalog(false)
      }
    },
    [orgId]
  )

  // Initial load
  useEffect(() => {
    if (!isReady || !orgId || loadedOrgId.current === orgId) return
    loadedOrgId.current = orgId
    void fetchCatalog()
  }, [isReady, orgId, fetchCatalog])

  // Search re-fetch
  useEffect(() => {
    if (!orgId) return
    void fetchCatalog(debouncedSearch)
  }, [debouncedSearch, orgId, fetchCatalog])

  // Apply role recommendations when role changes
  useEffect(() => {
    if (!selectedRole) return
    const recommended = ROLE_RECOMMENDATIONS[selectedRole] ?? []
    setCheckedSlugs((prev) => {
      const next = new Set(prev)
      for (const slug of recommended) {
        if (!manualUnchecked.has(slug)) {
          next.add(slug)
        }
      }
      return next
    })
  }, [selectedRole, manualUnchecked])

  function toggleTool(slug: string) {
    setCheckedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
        setManualUnchecked((mu) => new Set([...mu, slug]))
      } else {
        next.add(slug)
        setManualUnchecked((mu) => {
          const next2 = new Set(mu)
          next2.delete(slug)
          return next2
        })
      }
      return next
    })
  }

  function handleConnectSelected() {
    setSubmitting(true)
    setSelectedToolSlugs(Array.from(checkedSlugs))
    router.push('?step=tools-connect')
  }

  function handleSkip() {
    setSelectedToolSlugs([])
    router.push('?step=invite-team')
  }

  async function handleMissingSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = missingToolName.trim()
    if (!name) return
    setMissingSubmitting(true)
    try {
      await trpc.toolAccess.reportMissingIntegration.mutate({ orgId, toolName: name })
      setMissingSubmitted(name)
      setMissingToolName('')
    } catch {
      toast.error('Could not submit — please try again.')
    } finally {
      setMissingSubmitting(false)
    }
  }

  // Tier-1 tools sorted to top
  const sortedCatalog = [...catalog].sort((a, b) => {
    if (a.supportTier === 'tier_1' && b.supportTier !== 'tier_1') return -1
    if (b.supportTier === 'tier_1' && a.supportTier !== 'tier_1') return 1
    return a.name.localeCompare(b.name)
  })

  const hasChecked = checkedSlugs.size > 0

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Pick your tools</h1>
        <p className="text-sm text-muted-foreground">
          Select the integrations Kodi should have access to. You can change these any time in Settings.
        </p>
      </div>

      {/* Role selector */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your role
        </p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <button
              key={role.value}
              type="button"
              onClick={() =>
                setSelectedRole((prev) =>
                  prev === role.value ? null : role.value
                )
              }
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                selectedRole === role.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:border-primary/50 hover:bg-muted'
              )}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search integrations…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Catalog grid */}
      {loadingCatalog && catalog.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : catalogError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load integrations.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => fetchCatalog(debouncedSearch)}
          >
            Retry
          </button>
        </div>
      ) : sortedCatalog.length === 0 && debouncedSearch ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No integrations found for &ldquo;{debouncedSearch}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sortedCatalog.map((item) => {
            const checked = checkedSlugs.has(item.slug)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => toggleTool(item.slug)}
                className={cn(
                  'relative rounded-lg border p-3 text-left transition-colors',
                  checked
                    ? 'border-primary/70 bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    'absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-colors',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>

                {/* Logo */}
                <div className="mb-2 h-8 w-8">
                  {item.logo ? (
                    <img
                      src={item.logo}
                      alt=""
                      className="h-8 w-8 rounded object-contain"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-medium uppercase text-muted-foreground">
                      {item.name.slice(0, 2)}
                    </div>
                  )}
                </div>

                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {item.description}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* Coming soon */}
      {!debouncedSearch && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Coming soon
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COMING_SOON_TOOLS.map((tool) => (
              <div
                key={tool.slug}
                className="cursor-not-allowed rounded-lg border border-border/50 p-3 opacity-50"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-medium uppercase text-muted-foreground">
                  {tool.name.slice(0, 2)}
                </div>
                <p className="truncate text-sm font-medium">{tool.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing integration capture */}
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Don&apos;t see a tool you use?</p>
        {missingSubmitted ? (
          <p className="text-sm text-muted-foreground">
            Got it — we&apos;ll let you know when{' '}
            <strong className="text-foreground">{missingSubmitted}</strong> is available.
          </p>
        ) : (
          <form onSubmit={handleMissingSubmit} className="flex gap-2">
            <Input
              value={missingToolName}
              onChange={(e) => setMissingToolName(e.target.value)}
              placeholder="Tool name"
              className="h-8 text-sm"
              disabled={missingSubmitting}
              maxLength={100}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!missingToolName.trim() || missingSubmitting}
            >
              {missingSubmitting ? '…' : 'Let us know'}
            </Button>
          </form>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleConnectSelected}
          disabled={!hasChecked || submitting}
          className="w-full"
        >
          Connect selected tools
        </Button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
