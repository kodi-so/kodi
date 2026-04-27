export const ONBOARDING_STEPS = [
  { slug: 'org-setup',     label: 'Your team',  required: true  },
  { slug: 'choose-plan',   label: 'Plan',        required: true  },
  { slug: 'tools-pick',    label: 'Your tools', required: false },
  { slug: 'tools-connect', label: 'Connect',    required: false },
  { slug: 'invite-team',   label: 'Invite',     required: false },
  { slug: 'done',          label: 'Done',       required: true  },
] as const

export type OnboardingStepSlug =
  | 'org-setup'
  | 'choose-plan'
  | 'tools-pick'
  | 'tools-connect'
  | 'invite-team'
  | 'done'

export const VALID_STEP_SLUGS: readonly OnboardingStepSlug[] = ONBOARDING_STEPS.map(
  (s) => s.slug
)

export function isValidStepSlug(value: string | null): value is OnboardingStepSlug {
  return value !== null && (VALID_STEP_SLUGS as readonly string[]).includes(value)
}
