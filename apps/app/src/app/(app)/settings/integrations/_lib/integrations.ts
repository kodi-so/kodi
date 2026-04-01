'use client'

import { Mail, Video, type LucideIcon } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export type ZoomInstallStatus = Awaited<
  ReturnType<typeof trpc.zoom.getInstallStatus.query>
>

export type IntegrationId = 'zoom' | 'google-workspace'

export type IntegrationCard = {
  id: IntegrationId
  href: string
  name: string
  description: string
  searchText: string
  icon: LucideIcon
}

export const integrationCards: IntegrationCard[] = [
  {
    id: 'zoom',
    href: '/settings/integrations/zoom',
    name: 'Zoom',
    description: 'Meeting connection and live event setup.',
    searchText: 'zoom meetings conference rtms transcript',
    icon: Video,
  },
  {
    id: 'google-workspace',
    href: '/settings/integrations/google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Calendar, and Drive in one connection.',
    searchText: 'google gmail calendar drive workspace',
    icon: Mail,
  },
]

export function getZoomCardStatus(installStatus: ZoomInstallStatus | null) {
  const installation = installStatus?.installation ?? null

  if (installation?.status === 'active') return 'Connected'
  if (!installStatus?.featureFlags.zoomCopilot) return 'Feature off'
  if (!installStatus?.setup.configured) return 'Needs setup'
  if (installation?.status === 'error') return 'Attention needed'
  return 'Not connected'
}

export function getIntegrationStatusTone(status: string) {
  switch (status) {
    case 'Connected':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    case 'Needs setup':
    case 'Coming next':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-200'
    case 'Attention needed':
      return 'border-red-500/20 bg-red-500/10 text-red-200'
    default:
      return 'border-zinc-700 bg-zinc-900 text-zinc-300'
  }
}

export function formatIntegrationDate(value: Date | string | null | undefined) {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
