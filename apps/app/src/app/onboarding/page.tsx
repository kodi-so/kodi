'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isValidStepSlug } from './lib/steps'
import { OrgSetupStep } from './steps/org-setup'
import { ChoosePlanStep } from './steps/choose-plan'
import { ToolsPickStep } from './steps/tools-pick'
import { ToolsConnectStep } from './steps/tools-connect'
import { InviteTeamStep } from './steps/invite-team'
import { DoneStep } from './steps/done'

function OnboardingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = searchParams.get('step')

  // Redirect to first step if slug is missing or invalid
  useEffect(() => {
    if (!isValidStepSlug(step)) {
      router.replace('?step=org-setup')
    }
  }, [step, router])

  if (!isValidStepSlug(step)) {
    return (
      <div className="flex justify-center pt-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  switch (step) {
    case 'org-setup':
      return <OrgSetupStep />
    case 'choose-plan':
      return <ChoosePlanStep />
    case 'tools-pick':
      return <ToolsPickStep />
    case 'tools-connect':
      return <ToolsConnectStep />
    case 'invite-team':
      return <InviteTeamStep />
    case 'done':
      return <DoneStep />
  }
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center pt-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  )
}
