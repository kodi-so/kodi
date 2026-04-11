'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { Building2 } from 'lucide-react'
import {
  buildMeetingCopilotDisclosure,
  deriveMeetingBotIdentity,
  formatRetentionDays,
  getMeetingParticipationModeDescription,
  getMeetingParticipationModeLabel,
  meetingParticipationModeValues,
  type MeetingCopilotSettings,
} from '@kodi/db/client'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from '@kodi/ui'

export default function GeneralSettingsPage() {
  const { activeOrg, refreshOrgs } = useOrg()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (activeOrg) setName(activeOrg.orgName)
  }, [activeOrg])

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
  const isDirty = name.trim() !== currentOrg.orgName && name.trim().length > 0
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty || !isOwner) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await trpc.org.update.mutate({
        orgId: currentOrg.orgId,
        name: name.trim(),
      })
      await refreshOrgs()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

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
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-line bg-brand-accent-soft text-brand-accent-strong shadow-brand-panel">
              <Building2 size={18} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              General
            </h1>
          </div>
          <p className="ml-[3.25rem] text-sm leading-7 text-brand-quiet">
            Workspace settings for {currentOrg.orgName}
          </p>
        </div>

        <Card className="border-brand-line">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Workspace name
              </CardTitle>
              {!isOwner && <Badge variant="neutral">Read only</Badge>}
            </div>
            <CardDescription className="text-brand-quiet">
              Update how this workspace appears across Kodi.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner || saving}
                  maxLength={80}
                  placeholder="My Workspace"
                  className="h-12 rounded-xl border-brand-line bg-brand-elevated"
                />
                {!isOwner && (
                  <p className="mt-2 text-xs text-brand-subtle">
                    Only the workspace owner can change the name.
                  </p>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isOwner && (
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!isDirty || saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {saved && (
                    <span className="text-sm font-medium text-brand-success">
                      Saved
                    </span>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="border-brand-line">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Meeting copilot defaults
              </CardTitle>
              {!isOwner && <Badge variant="neutral">Read only</Badge>}
            </div>
            <CardDescription className="text-brand-quiet">
              These defaults set Kodi&apos;s visible identity, live
              participation mode, and pilot-safe response behavior for new
              meetings.
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
                <div className="space-y-2">
                  <Label
                    htmlFor="meeting-bot-display-name"
                    className="text-foreground"
                  >
                    Visible meeting display name
                  </Label>
                  <Input
                    id="meeting-bot-display-name"
                    value={copilotForm.botDisplayName ?? ''}
                    onChange={(event) =>
                      setCopilotForm((current) =>
                        current
                          ? {
                              ...current,
                              botDisplayName:
                                event.target.value.trim().length > 0
                                  ? event.target.value
                                  : null,
                            }
                          : current
                      )
                    }
                    disabled={!isOwner || copilotSaving}
                    placeholder={`Kodi for ${currentOrg.orgName}`}
                    className="h-12 rounded-xl border-brand-line bg-brand-elevated"
                  />
                  <p className="text-xs text-brand-subtle">
                    Leave this blank to keep the default derived workspace
                    identity.
                  </p>
                </div>

                {botIdentity && (
                  <div className="rounded-2xl border border-brand-line bg-brand-elevated p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
                      Identity preview
                    </p>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {botIdentity.displayName}
                      </p>
                      <p className="text-sm text-brand-quiet">
                        Invite address: {botIdentity.inviteEmail}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-foreground">
                    Default participation mode
                  </Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {meetingParticipationModeValues.map((mode) => {
                      const active =
                        copilotForm.defaultParticipationMode === mode

                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={!isOwner || copilotSaving}
                          onClick={() =>
                            setCopilotForm((current) =>
                              current
                                ? {
                                    ...current,
                                    defaultParticipationMode: mode,
                                  }
                                : current
                            )
                          }
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            active
                              ? 'border-foreground bg-brand-accent-soft text-foreground'
                              : 'border-brand-line bg-brand-elevated text-brand-quiet hover:border-foreground/20 hover:text-foreground'
                          }`}
                        >
                          <p className="text-sm font-medium">
                            {getMeetingParticipationModeLabel(mode)}
                          </p>
                          <p className="mt-2 text-xs leading-5">
                            {getMeetingParticipationModeDescription(mode)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-foreground">
                    Pilot response guardrails
                  </Label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-elevated p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-brand-line"
                        checked={copilotForm.chatResponsesRequireExplicitAsk}
                        disabled={!isOwner || copilotSaving}
                        onChange={(event) =>
                          setCopilotForm((current) =>
                            current
                              ? {
                                  ...current,
                                  chatResponsesRequireExplicitAsk:
                                    event.target.checked,
                                }
                              : current
                          )
                        }
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Require an explicit ask before Kodi replies in chat
                        </p>
                        <p className="text-xs leading-5 text-brand-quiet">
                          Keeps live chat participation limited to direct asks
                          and mentions.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-elevated p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-brand-line"
                        checked={copilotForm.voiceResponsesRequireExplicitPrompt}
                        disabled={!isOwner || copilotSaving}
                        onChange={(event) =>
                          setCopilotForm((current) =>
                            current
                              ? {
                                  ...current,
                                  voiceResponsesRequireExplicitPrompt:
                                    event.target.checked,
                                }
                              : current
                          )
                        }
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Require an explicit prompt before Kodi speaks
                        </p>
                        <p className="text-xs leading-5 text-brand-quiet">
                          Voice should stay request-driven in the pilot and avoid
                          autonomous interruption.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-elevated p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-brand-line"
                        checked={copilotForm.allowMeetingHostControls}
                        disabled={!isOwner || copilotSaving}
                        onChange={(event) =>
                          setCopilotForm((current) =>
                            current
                              ? {
                                  ...current,
                                  allowMeetingHostControls:
                                    event.target.checked,
                                }
                              : current
                          )
                        }
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Let the meeting starter narrow live participation
                        </p>
                        <p className="text-xs leading-5 text-brand-quiet">
                          Workspace owners can always change controls. This
                          option lets the meeting starter also move Kodi to
                          listen-only or stop live replies during a session.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-elevated p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-brand-line"
                        checked={copilotForm.consentNoticeEnabled}
                        disabled={!isOwner || copilotSaving}
                        onChange={(event) =>
                          setCopilotForm((current) =>
                            current
                              ? {
                                  ...current,
                                  consentNoticeEnabled: event.target.checked,
                                }
                              : current
                          )
                        }
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Show consent and disclosure notices in product
                        </p>
                        <p className="text-xs leading-5 text-brand-quiet">
                          Keeps Kodi&apos;s listening and speaking behavior visible
                          before and during a meeting.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="transcript-retention-days"
                      className="text-foreground"
                    >
                      Transcript retention
                    </Label>
                    <Input
                      id="transcript-retention-days"
                      type="number"
                      min={1}
                      max={3650}
                      value={copilotForm.transcriptRetentionDays}
                      onChange={(event) =>
                        setCopilotForm((current) =>
                          current
                            ? {
                                ...current,
                                transcriptRetentionDays: Math.max(
                                  1,
                                  Number(event.target.value) || 1
                                ),
                              }
                            : current
                        )
                      }
                      disabled={!isOwner || copilotSaving}
                      className="h-12 rounded-xl border-brand-line bg-brand-elevated"
                    />
                    <p className="text-xs text-brand-subtle">
                      Current default: {formatRetentionDays(copilotForm.transcriptRetentionDays)}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="artifact-retention-days"
                      className="text-foreground"
                    >
                      Artifact retention
                    </Label>
                    <Input
                      id="artifact-retention-days"
                      type="number"
                      min={1}
                      max={3650}
                      value={copilotForm.artifactRetentionDays}
                      onChange={(event) =>
                        setCopilotForm((current) =>
                          current
                            ? {
                                ...current,
                                artifactRetentionDays: Math.max(
                                  1,
                                  Number(event.target.value) || 1
                                ),
                              }
                            : current
                        )
                      }
                      disabled={!isOwner || copilotSaving}
                      className="h-12 rounded-xl border-brand-line bg-brand-elevated"
                    />
                    <p className="text-xs text-brand-subtle">
                      Current default: {formatRetentionDays(copilotForm.artifactRetentionDays)}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-brand-line bg-brand-elevated p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-brand-subtle">
                    Disclosure contract
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
                    {buildMeetingCopilotDisclosure(copilotForm).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>

                {copilotError && (
                  <Alert variant="destructive">
                    <AlertDescription>{copilotError}</AlertDescription>
                  </Alert>
                )}

                {isOwner && (
                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={!copilotIsDirty || copilotSaving}
                    >
                      {copilotSaving ? 'Saving…' : 'Save copilot defaults'}
                    </Button>
                    {copilotSaved && (
                      <span className="text-sm font-medium text-brand-success">
                        Saved
                      </span>
                    )}
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  )
}
