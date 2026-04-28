import { Badge } from '@kodi/ui/components/badge'
import { CTACluster } from './cta-cluster'
import { Sparkles } from 'lucide-react'
import {
  ProductWindow,
  MeetingHeader,
  ActionRow,
  ContextSource,
} from './product-frame'
import { heroContent } from '@/content/marketing/homepage'
import { ctaConfig } from '@/content/marketing/site-config'

export function HeroSection() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '/app'

  return (
    <section
      aria-label="Hero"
      className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36 lg:pb-24"
    >
      {/* Glow backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--kodi-hero-glow)/0.22),transparent_60%)]"
      />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,480px)] lg:items-center">
          {/* Left: copy */}
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="w-fit border-border/80 bg-card/70 px-3 py-1.5"
            >
              <Sparkles size={11} className="mr-2 text-brand-accent" />
              {heroContent.eyebrow}
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-xl whitespace-pre-line text-5xl leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-[4.25rem]">
                {heroContent.headline}
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                {heroContent.subhead}
              </p>
            </div>

            <CTACluster
              primary={{ label: ctaConfig.primary.label, href: appUrl }}
              secondary={{
                label: heroContent.secondaryCta,
                href: '/#how-it-works',
              }}
            />

            <ul className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {[
                'Answers with live company context',
                'Captures decisions in real time',
                'Moves work into your existing tools',
              ].map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-2"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-success" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: product proof canvas */}
          <div className="w-full">
            <HeroProductCanvas />
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroProductCanvas() {
  return (
    <div className="kodi-panel-surface relative rounded-[2rem] border border-brand-line p-4 shadow-soft sm:p-5">
      <div className="kodi-panel-muted-surface rounded-[1.6rem] border border-brand-line p-5">
        <MeetingHeader title="Q2 planning — go-to-market review" participants={5} />

        {/* Live activity feed */}
        <div className="space-y-2.5">
          <div className="rounded-xl border border-brand-line bg-brand-elevated px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Decision captured
            </p>
            <p className="mt-1.5 text-sm text-foreground">
              &ldquo;Move pilot close date to end of May &mdash; Sarah owns follow-up&rdquo;
            </p>
          </div>

          <div className="rounded-xl border border-brand-line bg-brand-elevated px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Kodi answering
            </p>
            <p className="mt-1.5 text-sm text-foreground">
              &ldquo;Based on the current pipeline in HubSpot, you have 3 pilots active.
              The closest to close is Meridian &mdash; 82% confidence, $24k ARR.&rdquo;
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['HubSpot', 'Notion'].map((src) => (
                <span
                  key={src}
                  className="rounded-full border border-brand-accent/30 bg-brand-accent-soft px-2 py-0.5 text-xs text-brand-accent-strong"
                >
                  from {src}
                </span>
              ))}
            </div>
          </div>

          <ActionRow
            action="Create Linear ticket: Review Meridian pilot terms"
            tool="Linear"
            status="pending"
          />
          <ActionRow
            action="Draft Slack update to #sales with pilot status"
            tool="Slack"
            status="drafting"
          />
        </div>
      </div>
    </div>
  )
}
