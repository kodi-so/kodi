import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Play,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@kodi/ui/components/badge'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { Button } from '@kodi/ui/components/button'

const proofPoints = [
  'Live company context in every call',
  'Agents that create tickets, recaps, and messages — not you',
  'Full control over what runs automatically',
]

const flow = [
  {
    label: 'During the call',
    title: 'Kodi keeps the room grounded',
    body: 'Questions get real answers. Decisions get locked in. Nothing important gets dropped.',
  },
  {
    label: 'Right after',
    title: 'Follow-up is already drafted',
    body: 'Recaps, tickets, Slack updates, and docs land in your tools before the momentum fades.',
  },
  {
    label: 'Between meetings',
    title: 'Work keeps moving, on your terms',
    body: 'You decide when Kodi suggests, asks for approval, or just executes — within the limits you set.',
  },
]

const integrations = [
  { name: 'Slack', slug: 'slack' },
  { name: 'Linear', slug: 'linear' },
  { name: 'Notion', slug: 'notion' },
  { name: 'Zoom', slug: 'zoom' },
  { name: 'GitHub', slug: 'github' },
  { name: 'HubSpot', slug: 'hubspot' },
  { name: 'Jira', slug: 'jira' },
  { name: 'Asana', slug: 'asana' },
  { name: 'Salesforce', slug: 'salesforce' },
  { name: 'Figma', slug: 'figma' },
  { name: 'ClickUp', slug: 'clickup' },
  { name: 'Google Meet', slug: 'googlemeet' },
  { name: 'Discord', slug: 'discord' },
  { name: 'Airtable', slug: 'airtable' },
  { name: 'Confluence', slug: 'confluence' },
  { name: 'Zendesk', slug: 'zendesk' },
  { name: 'Drive', slug: 'googledrive' },
  { name: 'Gmail', slug: 'gmail' },
  { name: 'Trello', slug: 'trello' },
  { name: 'Monday', slug: 'mondaydotcom' },
]

const recapOutcomes = [
  'API migration remains on Marcus, with engineering review on Thursday.',
  'Customer rollout stays tied to the April 28 cutover if QA signs off.',
  'Kodi should handle ticket creation, Slack recap, and owner follow-up immediately.',
]

const recapDecisions = [
  {
    summary: 'Ship the migration behind the staged rollout plan.',
    context: 'Keeps support load contained while QA closes the final edge-case pass.',
  },
  {
    summary: 'Route ownership through Marcus with PM visibility in Linear.',
    context: 'Lets engineering move without waiting on a second coordination pass.',
  },
]

const agentActions = [
  {
    title: 'Linear issue created',
    meta: 'Assigned to Marcus • Due Apr 18',
    status: 'Queued',
  },
  {
    title: 'Slack recap drafted',
    meta: '#product-eng • Ready to send',
    status: 'Ready',
  },
  {
    title: 'Owner follow-up sent',
    meta: 'Marcus notified with next steps',
    status: 'Delivered',
  },
]

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'
  // Set NEXT_PUBLIC_DEMO_VIDEO_URL to a Loom, YouTube, or Vimeo embed URL to enable the video
  const demoVideoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">

        {/* NAV */}
        <nav className="flex items-center justify-between border-b border-border/80 pb-5">
          <BrandLogo size={34} />
          <Button asChild className="gap-2">
            <a href={appUrl}>
              Get started
              <ArrowRight size={16} />
            </a>
          </Button>
        </nav>

        {/* HERO */}
        <section className="grid flex-1 gap-12 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,480px)] lg:items-center lg:py-20">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="w-fit border-border/80 bg-card/70 px-3 py-1.5"
            >
              <Sparkles size={12} className="mr-2" />
              AI agents that do the work
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl leading-[0.95] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                Agents that turn decisions into done.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                Kodi captures every decision with full context, then agents
                handle the follow-up — tickets, recaps, messages, docs —
                automatically, within guardrails you control.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <a href={appUrl}>
                  Get started
                  <ArrowRight size={16} />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-border/80 bg-card/65"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>

            <ul className="space-y-3 text-sm text-muted-foreground">
              {proofPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2.5 rounded-2xl border border-border/75 bg-card/70 px-4 py-3"
                >
                  <Check size={15} className="shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* DEMO PANEL */}
          <div className="kodi-panel-surface rounded-[2rem] border border-brand-line p-4 shadow-brand-panel">
            <div className="flex items-center justify-between rounded-[1.4rem] border border-brand-line bg-background px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-foreground">
                  <BrandLogo
                    size={20}
                    showWordmark={false}
                    className="size-5"
                    markClassName="size-5"
                  />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    Meeting recap
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Q2 planning sync
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-brand-line bg-card/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Ready
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {demoVideoUrl ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-brand-line bg-background">
                  <div className="flex items-center gap-2 border-b border-brand-line px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <Play size={12} className="text-primary" />
                    Watch the recap flow
                  </div>
                  <div className="aspect-video bg-card">
                    <iframe
                      src={demoVideoUrl}
                      title="Kodi demo video"
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-brand-line bg-background p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Summary
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-7 text-foreground">
                      Kodi captured the rollout plan, confirmed ownership, and
                      packaged the next steps while the team was still leaving the call.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-card/70 text-xs"
                  >
                    3 key outcomes
                  </Badge>
                </div>

                <ul className="mt-4 space-y-2.5">
                  {recapOutcomes.map((outcome) => (
                    <li
                      key={outcome}
                      className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-3 text-sm text-foreground"
                    >
                      <CheckCircle2
                        size={14}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.5rem] border border-brand-line bg-background p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground">
                      <FileText size={15} />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Decisions
                      </p>
                      <p className="text-sm text-foreground">What Kodi locked in</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recapDecisions.map((decision) => (
                      <div
                        key={decision.summary}
                        className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {decision.summary}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          {decision.context}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-brand-line bg-background p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground">
                      <ClipboardList size={15} />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Kodi took on the work
                      </p>
                      <p className="text-sm text-foreground">Follow-through in motion</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {agentActions.map((action) => (
                      <div
                        key={action.title}
                        className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            {action.title}
                          </p>
                          <Badge
                            variant="outline"
                            className="border-border/80 bg-background text-[11px]"
                          >
                            {action.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          {action.meta}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS CAROUSEL */}
        <section className="border-t border-border/80 py-10">
          <p className="text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Works with your stack
          </p>

          <div className="group relative mt-6 overflow-hidden">
            {/* Fade edges */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

            <div className="flex animate-[marquee_40s_linear_infinite] gap-3 group-hover:[animation-play-state:paused]">
              {[...integrations, ...integrations].map((integration, i) => (
                <div
                  key={i}
                  className="flex shrink-0 items-center gap-2.5 rounded-full border border-brand-line bg-card/80 px-5 py-2.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://cdn.simpleicons.org/${integration.slug}`}
                    alt={integration.name}
                    width={16}
                    height={16}
                    className="h-4 w-4 opacity-60 grayscale"
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {integration.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            ...and 200+ more integrations
          </p>
        </section>

        {/* HOW IT WORKS */}
        <section
          id="how-it-works"
          className="border-t border-border/80 py-12 lg:py-16"
        >
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <h2 className="max-w-2xl text-4xl tracking-[-0.05em]">
              In the meeting, after it, and in between.
            </h2>
          </div>

          <div className="mt-10 grid gap-0 lg:grid-cols-3">
            {flow.map((item, index) => (
              <div
                key={item.label}
                className={`space-y-3 border-t border-border/70 py-6 lg:border-t-0 lg:py-0 ${
                  index > 0 ? 'lg:border-l lg:pl-8' : 'lg:pr-8'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    0{index + 1}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </span>
                </div>
                <h3 className="text-xl tracking-[-0.04em] text-foreground">
                  {item.title}
                </h3>
                <p className="text-base leading-7 text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="border-t border-border/80 py-12">
          <div className="kodi-panel-surface rounded-[2rem] border border-brand-line px-8 py-12 text-center shadow-brand-panel sm:px-12 sm:py-16">
            <h2 className="text-4xl tracking-[-0.05em]">
              Ready to stop losing the follow-through?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-muted-foreground">
              Kodi works in your calls, connects to the tools your team already
              uses, and gets smarter with every decision.
            </p>
            <Button asChild size="lg" className="mt-8 gap-2">
              <a href={appUrl}>
                Get started
                <ArrowRight size={16} />
              </a>
            </Button>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-border/80 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo size={24} />
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Kodi
              </span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </a>
              <a href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </a>
            </div>
          </div>
        </footer>

      </div>
    </main>
  )
}
