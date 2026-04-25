'use client'

import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import type { ToolAccessCatalog } from '../_lib/tool-access-ui'

type SetupIssue = { key: string; message: string }

function collectIssues(catalog: ToolAccessCatalog | null): SetupIssue[] {
  if (!catalog) return []
  const issues: SetupIssue[] = []
  if (!catalog.setup.apiConfigured) {
    issues.push({
      key: 'composio',
      message:
        'Composio is not configured in this environment yet. Add the missing API values to make the tool catalog connectable.',
    })
  }
  if (!catalog.featureFlags.toolAccess) {
    issues.push({
      key: 'flag',
      message:
        'Tool access is off in this environment right now, so the catalog stays browse-only until the feature flag is enabled.',
    })
  }
  if (catalog.syncError) {
    issues.push({
      key: 'sync',
      message: catalog.syncError,
    })
  }
  return issues
}

export function hasSetupIssue(catalog: ToolAccessCatalog | null): boolean {
  return collectIssues(catalog).length > 0
}

export function SetupAlerts({
  catalog,
  actionError,
}: {
  catalog: ToolAccessCatalog | null
  actionError: string | null
}) {
  const issues = collectIssues(catalog)
  const [first, ...rest] = issues

  return (
    <>
      {actionError && catalog && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {first && rest.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>{first.message}</AlertDescription>
        </Alert>
      )}
      {rest.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <p className="font-medium text-foreground">
              Tool integrations need setup before they can run.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={issue.key}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
