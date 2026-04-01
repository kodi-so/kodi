'use client'

import { Link2, Mail, Video, type LucideIcon } from 'lucide-react'
import { trpc } from '@/lib/trpc'

export type ZoomInstallStatus = Awaited<
  ReturnType<typeof trpc.zoom.getInstallStatus.query>
>

export type ToolAccessStatus = Awaited<
  ReturnType<typeof trpc.toolAccess.getStatus.query>
>

export type IntegrationId = 'zoom' | 'google-workspace' | 'tool-access'

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
  {
    id: 'tool-access',
    href: '/settings/integrations/tool-access',
    name: 'Tool Access',
    description: 'Browse Composio integrations and connect your accounts.',
    searchText: 'composio tools github slack linear notion crm integrations',
    icon: Link2,
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

export function getToolAccessCardStatus(
  toolAccessStatus: ToolAccessStatus | null
) {
  if (!toolAccessStatus) return 'Not available'
  if (!toolAccessStatus?.featureFlags.toolAccess) return 'Feature off'
  if (!toolAccessStatus?.setup.apiConfigured) return 'Needs setup'
  if (toolAccessStatus.summary.attentionCount > 0) return 'Attention needed'
  if (toolAccessStatus.summary.activeCount > 0) {
    return `${toolAccessStatus.summary.activeCount} connected`
  }
  return 'Ready to browse'
}

export function getIntegrationStatusTone(status: string) {
  const normalized = status.trim().toLowerCase()

  if (normalized === 'connected' || normalized.endsWith(' connected')) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (normalized.includes('ready')) {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-200'
  }

  if (normalized.includes('connecting')) {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-200'
  }

  if (normalized.includes('needs') || normalized.includes('coming next')) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200'
  }

  if (normalized.includes('attention') || normalized.includes('error')) {
    return 'border-red-500/20 bg-red-500/10 text-red-200'
  }

  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
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
