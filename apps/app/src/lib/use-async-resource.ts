'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseAsyncResourceResult<T> {
  data: T | null
  error: string | null
  status: AsyncStatus
  /** First load with no prior data — show full skeleton. */
  isInitialLoading: boolean
  /** Subsequent load while prior data is on screen — show a subtle indicator, do NOT unmount the content. */
  isRefreshing: boolean
  /** Re-run the fetcher; does not clear existing data, so no flash. */
  refresh: () => Promise<T | null>
  /** Optimistically update local data without a network round-trip. */
  mutate: (updater: T | null | ((current: T | null) => T | null)) => void
  /** Clear local data and error (e.g., on logout / workspace switch). */
  reset: () => void
}

export interface UseAsyncResourceOptions {
  /** Set false to skip auto-fetch (e.g., while orgId is null). Default true. */
  enabled?: boolean
}

/**
 * Loads an async resource and exposes both `isInitialLoading` and `isRefreshing`
 * so callers can avoid flashing skeletons on re-fetch after a mutation.
 *
 * Fetcher receives an AbortSignal; bail out (return null) to skip a fetch
 * without affecting current data.
 */
export function useAsyncResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T | null>,
  deps: React.DependencyList,
  options: UseAsyncResourceOptions = {}
): UseAsyncResourceResult<T> {
  const { enabled = true } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<AsyncStatus>('idle')

  // Keep latest fetcher in a ref so callers don't need to memoize it.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // Track in-flight requests so concurrent refreshes don't race.
  const abortRef = useRef<AbortController | null>(null)
  const dataRef = useRef<T | null>(null)
  dataRef.current = data

  const run = useCallback(async (): Promise<T | null> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('loading')
    setError(null)
    try {
      const result = await fetcherRef.current(controller.signal)
      if (controller.signal.aborted) return null
      if (result !== null) setData(result)
      setStatus('success')
      return result
    } catch (err) {
      if (controller.signal.aborted) return null
      const message = err instanceof Error ? err.message : 'Request failed.'
      setError(message)
      setStatus('error')
      return null
    }
  }, [])

  // Auto-fetch on dep change.
  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort()
      setStatus('idle')
      return
    }
    void run()
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps])

  const mutate = useCallback(
    (updater: T | null | ((current: T | null) => T | null)) => {
      setData((current) =>
        typeof updater === 'function'
          ? (updater as (current: T | null) => T | null)(current)
          : updater
      )
    },
    []
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setData(null)
    setError(null)
    setStatus('idle')
  }, [])

  const hasData = data !== null
  const isLoading = status === 'loading'

  return {
    data,
    error,
    status,
    isInitialLoading: isLoading && !hasData,
    isRefreshing: isLoading && hasData,
    refresh: run,
    mutate,
    reset,
  }
}
