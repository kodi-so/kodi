import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Badge } from '@kodi/ui/components/badge'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { Button } from '@kodi/ui/components/button'

const proofPoints = [
  'Answers with live company context',
  'Captures decisions and owners in the room',
  'Moves follow-up into the tools your team already uses',
]

const flow = [
  {
    label: 'During the meeting',
    title: 'Kodi keeps the room aligned',
    body: 'Questions get answered, decisions get pinned down, and next steps stop drifting.',
  },
  {
    label: 'Right after',
    title: 'The handoff is already drafted',
    body: 'Recaps, tickets, Slack updates, and docs are ready before the momentum disappears.',
  },
  {
    label: 'Ongoing',
    title: 'Work keeps moving inside policy',
    body: 'You choose when Kodi suggests, asks first, or executes within the limits you set.',
  },
]

const tools = ['Zoom', 'Google Meet', 'Slack', 'Linear', 'Notion', 'HubSpot']

export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between border-b border-border/80 pb-5">
          <BrandLogo size={34} />

          <Button asChild className="gap-2">
            <a href={appUrl}>
              Open web app
              <ArrowRight size={16} />
            </a>
          </Button>
        </nav>

        <section className="grid flex-1 gap-12 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,460px)] lg:items-center lg:py-20">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="w-fit border-border/80 bg-card/70 px-3 py-1.5"
            >
              <Sparkles size={12} className="mr-2" />
              AI teammate for meetings and follow-through
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl leading-[0.95] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
                Leave the room with the next move already underway.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Kodi listens, answers with context, captures decisions, and
                pushes the follow-up work forward while the conversation is
                still fresh.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <a href={appUrl}>
                  Open web app
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

            <ul className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {proofPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 rounded-2xl border border-border/75 bg-card/70 px-4 py-3"
                >
                  <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="kodi-panel-surface rounded-[2rem] border border-brand-line p-4 shadow-brand-panel sm:p-6">
            <div className="kodi-panel-muted-surface rounded-[1.6rem] border border-brand-line p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
                    Weekly operating review
                  </p>
                  <h2 className="mt-2 text-2xl tracking-[-0.04em]">
                    Kodi is already lining up the follow-through
                  </h2>
                </div>
                <div className="rounded-full border border-brand-line bg-brand-elevated px-3 py-1 text-sm text-muted-foreground">
                  live
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {flow.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.4rem] border border-brand-line bg-brand-elevated p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-lg tracking-[-0.03em] text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-full border border-brand-line bg-brand-elevated px-3 py-1 text-sm text-muted-foreground"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="grid gap-10 border-t border-border/80 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:py-16"
        >
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <h2 className="max-w-2xl text-4xl tracking-[-0.05em]">
              One system for listening, thinking, and moving the work.
            </h2>
            <div className="space-y-4">
              {flow.map((item, index) => (
                <div
                  key={item.label}
                  className="grid gap-3 border-b border-border/70 pb-4 last:border-b-0"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                      0{index + 1}
                    </span>
                    <h3 className="text-xl tracking-[-0.04em]">{item.title}</h3>
                  </div>
                  <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="kodi-panel-muted-surface rounded-[1.8rem] border border-brand-line p-6">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              What teams get back
            </p>
            <ul className="mt-5 space-y-4">
              <li className="border-b border-border/70 pb-4 text-base leading-7 text-foreground">
                Fewer dropped decisions
              </li>
              <li className="border-b border-border/70 pb-4 text-base leading-7 text-foreground">
                Less manual recap and ticket writing
              </li>
              <li className="border-b border-border/70 pb-4 text-base leading-7 text-foreground">
                Clearer ownership while the context is still fresh
              </li>
              <li className="text-base leading-7 text-foreground">
                Faster movement from discussion to execution
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  )
}
