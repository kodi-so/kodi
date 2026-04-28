import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { RevealOnScroll } from './reveal-on-scroll'
import { ProductWindow, MeetingHeader, ContextSource } from './product-frame'

export function LiveContextChapter() {
  return (
    <SectionShell className="bg-brand-room-dark py-16 sm:py-20 lg:py-28">
      <RevealOnScroll>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Text */}
          <div className="reveal space-y-6">
            <SectionEyebrow variant="light">Live context in the room</SectionEyebrow>
            <h2 className="text-3xl tracking-[-0.045em] text-brand-room-dark-text sm:text-4xl">
              The answer to the hard question, already in the room.
            </h2>
            <p className="text-base leading-8 text-brand-room-dark-muted">
              When a live question surfaces in your meeting — about a deal, a customer, a
              sprint, a number — Kodi pulls the answer from the tools your team actually
              uses, not from its training data. The answer is grounded, cited, and
              delivered while the conversation is still happening.
            </p>
            <ul className="space-y-4">
              {[
                'Draws from CRM, ticketing, docs, and calendar in real time',
                'Shows the source behind every answer so trust is earned, not assumed',
                'Works without anyone having to stop and search',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-brand-room-dark-muted">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-success"
                    aria-hidden="true"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual */}
          <div className="reveal">
            <LiveContextCanvas />
          </div>
        </div>
      </RevealOnScroll>
    </SectionShell>
  )
}

function LiveContextCanvas() {
  return (
    <ProductWindow dark>
      <MeetingHeader title="Investor pipeline review" participants={3} dark />

      {/* Question */}
      <div className="mb-3 rounded-xl border border-brand-room-dark-border bg-[hsl(var(--kodi-room-dark)/0.6)] p-3">
        <p className="text-xs uppercase tracking-[0.16em] text-brand-room-dark-muted">
          Live question
        </p>
        <p className="mt-1.5 text-sm text-brand-room-dark-text">
          &ldquo;What&apos;s our current runway if we close the two pilots we discussed?&rdquo;
        </p>
      </div>

      {/* Kodi response */}
      <div className="mb-3 rounded-xl border border-brand-room-dark-border bg-[hsl(var(--kodi-room-dark)/0.6)] p-3">
        <p className="text-xs uppercase tracking-[0.16em] text-brand-room-dark-muted">
          Kodi
        </p>
        <p className="mt-1.5 text-sm leading-6 text-brand-room-dark-text">
          &ldquo;At current burn, you have approximately 11.4 months runway. Closing both pilots
          adds $52k ARR &mdash; that extends to 14.2 months. Assumes you hit the May billing date
          in your Stripe data.&rdquo;
        </p>
      </div>

      {/* Sources */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-brand-room-dark-muted">
          Drawn from
        </p>
        <ContextSource
          source="Stripe"
          snippet="Current MRR: $38,400 · Burn rate: ~$42k/mo"
          dark
        />
        <ContextSource
          source="HubSpot"
          snippet="2 open pilots: Meridian ($28k ARR), Solstice ($24k ARR)"
          dark
        />
        <ContextSource
          source="Notion"
          snippet="Finance doc: Runway model updated Apr 15"
          dark
        />
      </div>
    </ProductWindow>
  )
}
