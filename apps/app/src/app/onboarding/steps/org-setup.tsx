'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@kodi/ui/components/button'
import { Input } from '@kodi/ui/components/input'
import { Label } from '@kodi/ui/components/label'
import { trpc } from '@/lib/trpc'
import { useOnboarding } from '../lib/onboarding-context'

export function OrgSetupStep() {
  const router = useRouter()
  const { orgId, orgName, botDisplayName, setOrgName, setBotDisplayName, setProvisioningStatus, isReady } =
    useOnboarding()

  const [teamName, setTeamName] = useState('')
  const [botName, setBotName] = useState('Kodi')
  const [loading, setLoading] = useState(false)
  const [teamNameError, setTeamNameError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const synced = useRef(false)

  // Sync initial values from context once ready, clearing the "Personal" default
  useEffect(() => {
    if (!isReady || synced.current) return
    synced.current = true
    setTeamName(orgName === 'Personal' ? '' : orgName)
    setBotName(botDisplayName || 'Kodi')
  }, [isReady, orgName, botDisplayName])

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmedTeam = teamName.trim()
    if (!trimmedTeam) {
      setTeamNameError('Team name is required')
      inputRef.current?.focus()
      return
    }
    if (trimmedTeam.length > 80) {
      setTeamNameError('Team name must be 80 characters or less')
      return
    }
    setTeamNameError('')
    setLoading(true)

    try {
      // 1. Rename the org
      await trpc.org.update.mutate({ orgId, name: trimmedTeam })

      // 2. Save bot display name if it differs from the default
      const trimmedBot = botName.trim() || 'Kodi'
      if (trimmedBot !== 'Kodi') {
        const current = await trpc.meeting.getCopilotSettings.query({ orgId })
        await trpc.meeting.updateCopilotSettings.mutate({
          orgId,
          botDisplayName: trimmedBot,
          defaultParticipationMode: current.settings.defaultParticipationMode,
          chatResponsesRequireExplicitAsk: current.settings.chatResponsesRequireExplicitAsk,
          voiceResponsesRequireExplicitPrompt: current.settings.voiceResponsesRequireExplicitPrompt,
          allowMeetingHostControls: current.settings.allowMeetingHostControls,
          consentNoticeEnabled: current.settings.consentNoticeEnabled,
          transcriptRetentionDays: current.settings.transcriptRetentionDays,
          artifactRetentionDays: current.settings.artifactRetentionDays,
        })
      }

      // 3. Update context
      setOrgName(trimmedTeam)
      setBotDisplayName(botName.trim() || 'Kodi')

      // Phase 2: fire provisioning non-blocking so the agent spins up while the
      // user continues through optional steps.
      // TODO Phase 5: move provisioning trigger to post-billing confirmation.
      setProvisioningStatus('pending')
      trpc.instance.provision
        .mutate({ orgId })
        .catch((err: { data?: { code?: string } }) => {
          if (err?.data?.code === 'CONFLICT') {
            // Already provisioned — treat as running
            setProvisioningStatus('running')
          } else if (err?.data?.code === 'FORBIDDEN') {
            // No active subscription yet (pre-billing) — stay idle, no chip shown
            setProvisioningStatus('idle')
          } else {
            setProvisioningStatus('error')
          }
        })

      // 4. Advance to next step
      router.push('?step=tools-pick')
    } catch {
      toast.error('Something went wrong — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
        <p className="text-sm text-muted-foreground">
          Tell us a bit about your team to personalize Kodi.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="team-name">What should we call your team?</Label>
          <Input
            ref={inputRef}
            id="team-name"
            value={teamName}
            onChange={(e) => {
              setTeamName(e.target.value)
              if (teamNameError) setTeamNameError('')
            }}
            placeholder="e.g. Acme Corp"
            maxLength={80}
            disabled={loading}
          />
          {teamNameError && (
            <p className="text-xs text-destructive">{teamNameError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bot-name">
            What should your AI teammate be called in meetings?
          </Label>
          <Input
            id="bot-name"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Kodi"
            maxLength={80}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            This is the name other meeting participants will see.
          </p>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading || !isReady}>
        {loading ? 'Saving…' : 'Get started'}
      </Button>
    </form>
  )
}
