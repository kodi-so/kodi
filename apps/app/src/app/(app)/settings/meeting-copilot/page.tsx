'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import {
  deriveMeetingBotIdentity,
  type MeetingCopilotSettings,
} from '@kodi/db/client'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@kodi/ui'
import { PageHeader } from './_components/page-header'
import { DisplayNameField } from './_components/display-name-field'
import { BotIdentityPreview } from './_components/bot-identity-preview'
import { ParticipationModeSelector } from './_components/participation-mode-selector'
import { AdvancedSettings } from './_components/advanced-settings'
import { SaveFooter } from './_components/save-footer'

export default function MeetingCopilotSettingsPage() {
  const { activeOrg } = useOrg()
  const [copilotSettings, setCopilotSettings] =
    useState<MeetingCopilotSettings | null>(null)
  const [copilotForm, setCopilotForm] = useState<MeetingCopilotSettings | null>(
    null
  )
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotSaving, setCopilotSaving] = useState(false)
  const [copilotSaved, setCopilotSaved] = useState(false)
  const [copilotError, setCopilotError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrg) {
      setCopilotSettings(null)
      setCopilotForm(null)
      return
    }

    let cancelled = false
    setCopilotLoading(true)
    setCopilotError(null)

    void (async () => {
      try {
        const result = await trpc.meeting.getCopilotSettings.query({
          orgId: activeOrg.orgId,
        })
        if (cancelled) return
        setCopilotSettings(result.settings)
        setCopilotForm(result.settings)
      } catch (err) {
        if (cancelled) return
        setCopilotError(
          err instanceof Error
            ? err.message
            : 'Failed to load meeting copilot settings.'
        )
      } finally {
        if (!cancelled) {
          setCopilotLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeOrg])

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
        </div>
      </SettingsLayout>
    )
  }

  const currentOrg = activeOrg
  const isOwner = currentOrg.role === 'owner'
  const copilotIsDirty =
    copilotForm != null &&
    copilotSettings != null &&
    JSON.stringify(copilotForm) !== JSON.stringify(copilotSettings)
  const botIdentity =
    copilotForm != null
      ? deriveMeetingBotIdentity({
          orgName: currentOrg.orgName,
          orgSlug: currentOrg.orgSlug,
          displayNameOverride: copilotForm.botDisplayName,
        })
      : null

  async function handleCopilotSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isOwner || !copilotForm || !copilotIsDirty) return

    setCopilotSaving(true)
    setCopilotSaved(false)
    setCopilotError(null)

    try {
      const result = await trpc.meeting.updateCopilotSettings.mutate({
        orgId: currentOrg.orgId,
        ...copilotForm,
      })
      setCopilotSettings(result.settings)
      setCopilotForm(result.settings)
      setCopilotSaved(true)
      setTimeout(() => setCopilotSaved(false), 3000)
    } catch (err) {
      setCopilotError(
        err instanceof Error
          ? err.message
          : 'Failed to save meeting copilot settings.'
      )
    } finally {
      setCopilotSaving(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader />

        <Card className="border-brand-line">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Copilot defaults
              </CardTitle>
              {!isOwner && <Badge variant="neutral">Read only</Badge>}
            </div>
            <CardDescription className="text-brand-quiet">
              Set Kodi&apos;s visible identity and live participation mode for
              new meetings.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {copilotLoading || !copilotForm ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full bg-brand-muted" />
                <Skeleton className="h-24 w-full bg-brand-muted" />
                <Skeleton className="h-32 w-full bg-brand-muted" />
              </div>
            ) : (
              <form onSubmit={handleCopilotSave} className="space-y-6">
                <DisplayNameField
                  value={copilotForm.botDisplayName}
                  placeholder={`Kodi for ${currentOrg.orgName}`}
                  disabled={!isOwner || copilotSaving}
                  onChange={setCopilotForm}
                />

                {botIdentity && (
                  <BotIdentityPreview
                    displayName={botIdentity.displayName}
                    inviteEmail={botIdentity.inviteEmail}
                  />
                )}

                <ParticipationModeSelector
                  activeMode={copilotForm.defaultParticipationMode}
                  disabled={!isOwner || copilotSaving}
                  onChange={setCopilotForm}
                />

                <AdvancedSettings
                  form={copilotForm}
                  disabled={!isOwner || copilotSaving}
                  onChange={setCopilotForm}
                />

                <SaveFooter
                  error={copilotError}
                  isOwner={isOwner}
                  isDirty={copilotIsDirty}
                  saving={copilotSaving}
                  saved={copilotSaved}
                />
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  )
}
