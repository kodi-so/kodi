'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarDays, FolderOpen, Mail } from 'lucide-react'
import { Badge, Button } from '@kodi/ui'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../../_components/settings-layout'
import { getIntegrationStatusTone } from '../_lib/integrations'

export default function GoogleWorkspaceIntegrationPage() {
  const { activeOrg } = useOrg()

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
              <Mail size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Google Workspace
              </h1>
              <p className="text-sm text-zinc-400">
                One connection for Gmail, Calendar, and Drive in{' '}
                {activeOrg?.orgName ?? 'your workspace'}.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="space-y-4">
            <Badge className={getIntegrationStatusTone('Coming next')}>
              Coming next
            </Badge>
            <div className="space-y-2">
              <p className="text-sm font-medium text-white">
                This integration is planned but not connectable yet.
              </p>
              <p className="text-sm leading-6 text-zinc-400">
                The detail page is here so the navigation model stays simple:
                choose an integration from the cards page, then manage it on its
                own screen.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Mail size={16} className="text-zinc-400" />
              Gmail
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Read thread and inbox context.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <CalendarDays size={16} className="text-zinc-400" />
              Calendar
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Pull meeting and schedule context.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <FolderOpen size={16} className="text-zinc-400" />
              Drive
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Retrieve docs and file context.
            </p>
          </div>
        </div>
      </div>
    </SettingsLayout>
  )
}
