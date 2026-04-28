export type Integration = {
  name: string
  category: string
}

export type IntegrationCategory = {
  id: string
  label: string
  description: string
  integrations: Integration[]
}

export const integrationCategories: IntegrationCategory[] = [
  {
    id: 'video',
    label: 'Video meetings',
    description: 'Kodi joins your call and listens from the start.',
    integrations: [
      { name: 'Zoom', category: 'video' },
      { name: 'Google Meet', category: 'video' },
      { name: 'Microsoft Teams', category: 'video' },
    ],
  },
  {
    id: 'chat',
    label: 'Team chat',
    description: 'Follow-up lands where your team already talks.',
    integrations: [
      { name: 'Slack', category: 'chat' },
      { name: 'Microsoft Teams', category: 'chat' },
    ],
  },
  {
    id: 'ticketing',
    label: 'Ticketing & projects',
    description: 'Action items flow directly into your project tools.',
    integrations: [
      { name: 'Linear', category: 'ticketing' },
      { name: 'Jira', category: 'ticketing' },
      { name: 'Asana', category: 'ticketing' },
      { name: 'GitHub', category: 'ticketing' },
    ],
  },
  {
    id: 'docs',
    label: 'Docs & notes',
    description: 'Recaps, decisions, and context go where you write.',
    integrations: [
      { name: 'Notion', category: 'docs' },
      { name: 'Google Docs', category: 'docs' },
      { name: 'Confluence', category: 'docs' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    description: 'Customer context flows in; updates flow back out.',
    integrations: [
      { name: 'HubSpot', category: 'crm' },
      { name: 'Salesforce', category: 'crm' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Kodi knows what is coming and who is in the room.',
    integrations: [
      { name: 'Google Calendar', category: 'calendar' },
      { name: 'Outlook Calendar', category: 'calendar' },
    ],
  },
]

export const allIntegrations = integrationCategories.flatMap(
  (cat) => cat.integrations
)
