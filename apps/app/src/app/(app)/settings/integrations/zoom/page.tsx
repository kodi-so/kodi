'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Link2, RefreshCcw, Video } from 'lucide-react'
import { Alert, AlertDescription, Badge, Button, Skeleton } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { trpc } from '@/lib/trpc'
import { SettingsLayout } from '../../_components/settings-layout'
import {
  formatIntegrationDate,
  getIntegrationStatusTone,
  getZoomCardStatus,
  type ZoomInstallStatus,
} from '../_lib/integrations'

export default function ZoomIntegrationPage() {
  const searchParams = useSearchParams()
  const { orgs, activeOrg, setActiveOrg } = useOrg()
  const [installStatus, setInstallStatus] = useState<ZoomInstallStatus | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSetupDetails, setShowSetupDetails] = useState(false)
  const [action, setAction] = useState<
    'connect' | 'disconnect' | 'refresh' | null
  >(null)

  const callbackOrgId = searchParams.get('org')
  const callbackStatus = searchParams.get('zoom')

  useEffect(() => {
    if (!callbackOrgId) return
    const matchingOrg = orgs.find((org) => org.orgId === callbackOrgId)
    if (matchingOrg && matchingOrg.orgId !== activeOrg?.orgId) {
      setActiveOrg(matchingOrg)
    }
  }, [activeOrg?.orgId, callbackOrgId, orgs, setActiveOrg])

  useEffect(() => {
    if (!activeOrg) {
      setInstallStatus(null)
      setLoading(false)
      return
    }

    const orgId = activeOrg.orgId
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const status = await trpc.zoom.getInstallStatus.query({ orgId })

        if (cancelled) return
        setInstallStatus(status)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load Zoom integration.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeOrg?.orgId])

  const installation = installStatus?.installation ?? null
  const missingZoomSetup = installStatus?.setup.missing ?? []
  const isOwner = activeOrg?.role === 'owner'
  const zoomStatus = getZoomCardStatus(installStatus)

  const callbackBanner = useMemo(() => {
    if (callbackStatus === 'connected') {
      return {
        tone: 'success' as const,
        message:
          'Zoom connected. Kodi can now use meeting events for this workspace.',
      }
    }

    if (callbackStatus === 'error') {
      return {
        tone: 'error' as const,
        message:
          'Zoom connection did not finish. Check setup details and try again.',
      }
    }

    return null
  }, [callbackStatus])

  async function refresh() {
    if (!activeOrg) return
    setAction('refresh')
    try {
      const status = await trpc.zoom.getInstallStatus.query({
        orgId: activeOrg.orgId,
      })
      setInstallStatus(status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh Zoom.')
    } finally {
      setAction(null)
    }
  }

  async function connectZoom() {
    if (!activeOrg) return
    setAction('connect')
    try {
      const result = await trpc.zoom.getInstallUrl.mutate({
        orgId: activeOrg.orgId,
        returnPath: '/settings/integrations/zoom',
      })
      window.location.assign(result.url)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start Zoom install flow.'
      )
      setAction(null)
    }
  }

  async function disconnectZoom() {
    if (!activeOrg) return
    setAction('disconnect')
    try {
      await trpc.zoom.disconnect.mutate({ orgId: activeOrg.orgId })
      await refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disconnect Zoom.'
      )
      setAction(null)
    }
  }

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-zinc-700" />
        </div>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button
          asChild
          variant="ghost"
          className="w-fit gap-2 px-0 text-zinc-400 hover:bg-transparent hover:text-white"
        >
          <Link href="/settings/integrations">
            <ArrowLeft size={16} />
            Back to integrations
          </Link>
        </Button>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-200">
              <Video size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Zoom
              </h1>
              <p className="text-sm text-zinc-400">
                Connect Zoom so Kodi can follow meeting activity for{' '}
                {activeOrg.orgName}.
              </p>
            </div>
          </div>
        </div>

        {callbackBanner && (
          <Alert
            className={
              callbackBanner.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }
          >
            <AlertDescription>{callbackBanner.message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
            <Skeleton className="h-6 w-32 bg-zinc-800" />
            <Skeleton className="mt-4 h-4 w-56 bg-zinc-800" />
            <Skeleton className="mt-8 h-10 w-48 bg-zinc-800" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <Badge className={getIntegrationStatusTone(zoomStatus)}>
                    {zoomStatus}
                  </Badge>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white">
                      {installation
                        ? 'Zoom is connected for this workspace.'
                        : 'Zoom is not connected yet.'}
                    </p>
                    <p className="text-sm leading-6 text-zinc-400">
                      {installation
                        ? installation.externalAccountEmail
                          ? `Connected account: ${installation.externalAccountEmail}`
                          : 'A Zoom account is connected and ready.'
                        : isOwner
                          ? 'Connect Zoom to start receiving meeting events and runtime state.'
                          : 'A workspace owner needs to connect Zoom before meeting ingestion can start.'}
                    </p>
                    {installation && (
                      <p className="text-xs text-zinc-500">
                        Last updated{' '}
                        {formatIntegrationDate(installation.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void refresh()}
                    variant="ghost"
                    className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                    disabled={action !== null}
                  >
                    <RefreshCcw
                      size={16}
                      className={action === 'refresh' ? 'animate-spin' : ''}
                    />
                    Refresh
                  </Button>

                  {isOwner && !installation && (
                    <Button
                      onClick={() => void connectZoom()}
                      className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                      disabled={
                        action !== null || !installStatus?.setup.configured
                      }
                    >
                      <Link2 size={16} />
                      Connect Zoom
                    </Button>
                  )}

                  {isOwner && installation && (
                    <Button
                      onClick={() => void disconnectZoom()}
                      variant="outline"
                      className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                      disabled={action !== null}
                    >
                      Disconnect
                    </Button>
                  )}

                  <Button
                    asChild
                    variant="ghost"
                    className="gap-2 border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                  >
                    <Link href="/meetings">
                      Open meetings
                      <ArrowRight size={16} />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {!installStatus?.featureFlags.zoomCopilot && (
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                <AlertDescription>
                  The Zoom copilot feature flag is off right now, so the
                  connection will not be active in the product yet.
                </AlertDescription>
              </Alert>
            )}

            {missingZoomSetup.length > 0 && (
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                <AlertDescription>
                  Zoom still needs setup before it can connect:{' '}
                  {missingZoomSetup.join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {installation?.errorMessage && (
              <Alert className="border-red-500/30 bg-red-500/10 text-red-200">
                <AlertDescription>{installation.errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-white">
                    What this integration enables
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Meeting attachment, participant awareness, transcript event
                    flow, and the live meeting runtime Kodi uses during Zoom
                    calls.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSetupDetails((current) => !current)}
                  className="text-sm text-zinc-400 transition hover:text-white"
                >
                  {showSetupDetails
                    ? 'Hide setup details'
                    : 'Show setup details'}
                </button>

                {showSetupDetails && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Redirect URI
                      </p>
                      <p className="mt-2 break-all text-sm text-zinc-200">
                        {installStatus?.setup.redirectUri ?? 'Not configured'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Zoom app ID
                      </p>
                      <p className="mt-2 text-sm text-zinc-200">
                        {installStatus?.setup.appId ?? 'Not configured'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  )
}
