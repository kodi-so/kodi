/**
 * Detect LiteLLM budget-exceeded errors and return a user-friendly message.
 * Returns null if the error is not budget-related.
 *
 * LiteLLM returns errors containing "Budget has been exceeded" or
 * "ExceededBudget" when the key's max_budget is reached.
 */
export function getBudgetErrorMessage(error: unknown): string | null {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''

  const budgetPatterns = [
    'budget has been exceeded',
    'exceededbudget',
    'budget exceeded',
    'max budget reached',
    'rate_limit_error.*budget',
  ]

  const lower = message.toLowerCase()
  const isBudgetError = budgetPatterns.some((pattern) =>
    lower.includes(pattern.replace('.*', '')),
  )

  if (!isBudgetError) return null

  return 'Your usage limit has been reached. You can increase your spending cap or upgrade your plan in Billing Settings.'
}

/** The path to billing settings, used for constructing links. */
export const BILLING_SETTINGS_PATH = '/settings/billing'
