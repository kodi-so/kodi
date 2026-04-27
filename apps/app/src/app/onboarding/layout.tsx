'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@kodi/ui/lib/utils'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { OnboardingProvider } from './lib/onboarding-context'
import { ONBOARDING_STEPS } from './lib/steps'
import { ProvisioningStatusChip } from './components/provisioning-status-chip'

// Visible progress steps — tools-connect is a sub-step of tools-pick
const PROGRESS_STEPS = ONBOARDING_STEPS.filter((s) => s.slug !== 'tools-connect')

function WizardContent({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const currentStep = searchParams.get('step') ?? 'org-setup'

  const progressIndex = PROGRESS_STEPS.findIndex((s) => {
    if (currentStep === 'tools-connect') return s.slug === 'tools-pick'
    return s.slug === currentStep
  })

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-6">
        <BrandLogo />
        <div className="flex items-center gap-3">
          <ProvisioningStatusChip />
        </div>
      </header>

      {/* Progress dots */}
      <div className="flex justify-center px-6 py-3">
        <div className="flex items-center gap-2">
          {PROGRESS_STEPS.map((step, i) => (
            <div
              key={step.slug}
              className={cn(
                'rounded-full transition-all duration-300',
                i < progressIndex
                  ? 'h-1.5 w-6 bg-primary/70'
                  : i === progressIndex
                    ? 'h-1.5 w-8 bg-primary'
                    : 'h-1.5 w-4 bg-muted-foreground/20'
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  )
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OnboardingProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        }
      >
        <WizardContent>{children}</WizardContent>
      </Suspense>
    </OnboardingProvider>
  )
}
