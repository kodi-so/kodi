import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Calendar,
  FileText,
  FolderOpen,
  Github,
  Layers,
  Mail,
  Plug,
  Slack,
  Users,
  Zap,
} from 'lucide-react'

export type ToolkitMeta = {
  label: string
  icon: LucideIcon
  tint: string
}

const FALLBACK: ToolkitMeta = {
  label: 'External',
  icon: Plug,
  tint: 'text-muted-foreground',
}

const TOOLKIT_META: Record<string, ToolkitMeta> = {
  slack: { label: 'Slack', icon: Slack, tint: 'text-[#4A154B]' },
  linear: { label: 'Linear', icon: Zap, tint: 'text-[#5E6AD2]' },
  github: { label: 'GitHub', icon: Github, tint: 'text-foreground' },
  gmail: { label: 'Gmail', icon: Mail, tint: 'text-[#EA4335]' },
  googlecalendar: {
    label: 'Google Calendar',
    icon: Calendar,
    tint: 'text-[#4285F4]',
  },
  google_calendar: {
    label: 'Google Calendar',
    icon: Calendar,
    tint: 'text-[#4285F4]',
  },
  notion: { label: 'Notion', icon: FileText, tint: 'text-foreground' },
  hubspot: { label: 'HubSpot', icon: Users, tint: 'text-[#FF7A59]' },
  jira: { label: 'Jira', icon: Layers, tint: 'text-[#0052CC]' },
  googledrive: {
    label: 'Google Drive',
    icon: FolderOpen,
    tint: 'text-[#4285F4]',
  },
  google_drive: {
    label: 'Google Drive',
    icon: FolderOpen,
    tint: 'text-[#4285F4]',
  },
  confluence: { label: 'Confluence', icon: BookOpen, tint: 'text-[#0052CC]' },
  outlook: { label: 'Outlook', icon: Mail, tint: 'text-[#0078D4]' },
  microsoftoutlook: {
    label: 'Outlook',
    icon: Mail,
    tint: 'text-[#0078D4]',
  },
  microsoft_outlook: {
    label: 'Outlook',
    icon: Mail,
    tint: 'text-[#0078D4]',
  },
}

export function getToolkitMeta(
  slug: string | null | undefined
): ToolkitMeta {
  if (!slug) return FALLBACK
  const normalized = slug.toLowerCase().replace(/[-\s]/g, '_')
  const hit = TOOLKIT_META[normalized] ?? TOOLKIT_META[normalized.replace(/_/g, '')]
  return hit ?? { ...FALLBACK, label: titleCase(slug) }
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
