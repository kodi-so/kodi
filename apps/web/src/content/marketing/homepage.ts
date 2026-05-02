export const heroContent = {
  eyebrow: 'AI teammate for meetings and follow-through',
  headline: 'The meeting ends.\nThe work begins.',
  subhead:
    'Kodi joins meetings, answers with live business context, captures decisions, and moves the follow-through forward while the conversation is still fresh.',
  primaryCta: 'Start free',
  secondaryCta: 'See how it works',
} as const

export const proofBandItems = [
  {
    stat: '< 10 min',
    label: 'to connect your first meeting',
  },
  {
    stat: '8+',
    label: 'tool categories supported',
  },
  {
    stat: '100%',
    label: 'user-controlled autonomy',
  },
] as const

export const storyChapters = [
  {
    id: 'during',
    eyebrow: 'During the conversation',
    headline: 'Kodi keeps the room aligned.',
    body: 'Questions get answered with real business context, decisions get captured as they happen, and next steps stop drifting away. Kodi listens and surfaces the right information so the conversation moves faster and cleaner.',
    proofItems: [
      'Answers live questions from connected tools and docs',
      'Captures decisions and owners without interrupting the flow',
      'Surfaces relevant context from CRM, tickets, and notes',
    ],
  },
  {
    id: 'after',
    eyebrow: 'Right after the meeting',
    headline: 'The handoff is already drafted.',
    body: 'Before momentum disappears, Kodi has already prepared recaps, drafted follow-up tickets, written Slack updates, and queued the doc changes. You review and approve — or let it execute automatically within the limits you set.',
    proofItems: [
      'Meeting recap written and distributed instantly',
      'Follow-up tasks drafted and routed to the right tools',
      'Decision log attached where your team tracks it',
    ],
  },
  {
    id: 'between',
    eyebrow: 'Between meetings',
    headline: 'Work keeps moving inside your guardrails.',
    body: 'You define what Kodi suggests, asks approval for, or executes directly. As trust builds, you can dial up autonomy or pull it back — without ever losing visibility into what Kodi is doing on your behalf.',
    proofItems: [
      'Autonomy levels you control per action type',
      'Approval queue for writes that need a human sign-off',
      'Full audit trail of every action Kodi takes',
    ],
  },
] as const

export const audienceModules = [
  {
    role: 'Founders',
    pain: 'Critical meetings bounce back onto the founder as memory burden or execution burden.',
    value:
      'Kodi captures the decisions, routes the follow-up, and keeps work moving — so you stay in the room without becoming the bottleneck.',
  },
  {
    role: 'Operations leaders',
    pain: 'Coordination drag compounds every time a meeting ends without a clean handoff.',
    value:
      'Kodi reduces coordination tax by turning recurring discussions into visible, reliable follow-through that can increasingly carry itself.',
  },
  {
    role: 'Team leads',
    pain: 'Answers to live questions are scattered across Slack, docs, CRM, and ticketing.',
    value:
      'Kodi brings the context into the room so teams get faster answers, clearer ownership, and less manual overhead.',
  },
] as const

export const faqItems = [
  {
    question: 'How fast is setup?',
    answer:
      'Most teams are live in under 10 minutes. Connect your video platform, authorize the tools your team uses, and Kodi is ready for your next meeting.',
  },
  {
    question: 'How much does Kodi control?',
    answer:
      'Entirely up to you. You can keep Kodi in suggest-only mode, require approval before any write, or allow direct execution for specific action types. Autonomy is tunable per category.',
  },
  {
    question: 'What if my team uses different tools?',
    answer:
      'Kodi connects across video platforms, chat, docs, ticketing, CRM, and calendar. If a tool your team uses is not yet supported, the integration backlog is actively growing.',
  },
  {
    question: 'Is there seat-based pricing?',
    answer:
      'No. Kodi is priced by usage and value, not per seat. Lean teams should not be penalized for sharing a tool across the whole company.',
  },
  {
    question: 'Can I see what Kodi will do before it does it?',
    answer:
      'Yes. Every action Kodi proposes shows you exactly what it will do, in which tool, and why. You approve or reject before anything executes outside your set thresholds.',
  },
] as const
