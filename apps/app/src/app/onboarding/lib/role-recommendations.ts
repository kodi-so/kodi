/**
 * Maps onboarding role selections to recommended Composio toolkit slugs.
 * Slugs must match the Composio app slug exactly.
 */
export const ROLE_RECOMMENDATIONS: Record<string, string[]> = {
  engineering:  ['github', 'linear', 'jira', 'notion'],
  product:      ['linear', 'jira', 'notion', 'figma'],
  design:       ['figma', 'notion', 'slack'],
  sales:        ['salesforce', 'hubspot', 'gmail', 'slack'],
  marketing:    ['slack', 'notion', 'hubspot'],
  operations:   ['notion', 'slack', 'jira'],
  other:        ['notion', 'slack'],
}

export const ROLES = [
  { value: 'engineering', label: 'Engineering' },
  { value: 'product',     label: 'Product' },
  { value: 'design',      label: 'Design' },
  { value: 'sales',       label: 'Sales' },
  { value: 'marketing',   label: 'Marketing' },
  { value: 'operations',  label: 'Operations' },
  { value: 'other',       label: 'Other' },
] as const

/**
 * Tools that are popular but not yet in the Composio catalog.
 * Shown in a "Coming soon" section in the tools-pick step.
 */
export const COMING_SOON_TOOLS = [
  { slug: 'microsoft-teams', name: 'Microsoft Teams', description: 'Chat and video for Microsoft 365 workspaces' },
  { slug: 'monday',          name: 'Monday.com',       description: 'Visual project and workflow management' },
  { slug: 'asana',           name: 'Asana',            description: 'Task and project tracking' },
  { slug: 'confluence',      name: 'Confluence',       description: 'Team wiki and documentation by Atlassian' },
  { slug: 'trello',          name: 'Trello',           description: 'Kanban boards for teams' },
] as const
