import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { RevealOnScroll } from './reveal-on-scroll'
import {
  ProductWindow,
  ActionRow,
  StatusChip,
} from './product-frame'

const approvalFlow = [
  { step: '01', label: 'Captured', description: 'Decision logged from the meeting conversation.' },
  { step: '02', label: 'Drafted', description: 'Kodi prepares the action with full context.' },
  { step: '03', label: 'Awaiting approval', description: 'You see exactly what Kodi will do and where.' },
  { step: '04', label: 'Executed', description: 'Kodi completes the work in the connected tool.' },
]

export function ControlledAutonomyChapter() {
  return (
    <SectionShell>
      <RevealOnScroll>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Visual first on large screens */}
          <div className="reveal order-2 lg:order-1">
            <AutonomyCanvas />
          </div>

          {/* Text */}
          <div className="reveal order-1 space-y-6 lg:order-2">
            <SectionEyebrow variant="accent">Controlled autonomy</SectionEyebrow>
            <h2 className="text-3xl tracking-[-0.045em] sm:text-4xl">
              From discussion to done — with full visibility and control.
            </h2>
            <p className="text-base leading-8 text-muted-foreground">
              Kodi can draft, propose, and execute follow-through work across your
              connected tools. But it only does what you allow, at the level you set.
              Every action is visible, reviewable, and reversible.
            </p>

            {/* Flow steps */}
            <ol className="space-y-4">
              {approvalFlow.map((step) => (
                <li key={step.step} className="flex gap-4">
                  <span className="mt-0.5 text-xs font-normal uppercase tracking-[0.18em] text-muted-foreground">
                    {step.step}
                  </span>
                  <div>
                    <p className="text-sm text-foreground">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </RevealOnScroll>
    </SectionShell>
  )
}

function AutonomyCanvas() {
  return (
    <ProductWindow>
      {/* Approval prompt */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Approval requested
        </p>
        <p className="mt-2 text-base tracking-[-0.03em]">
          Kodi wants to create 3 tickets and send a Slack update
        </p>
      </div>

      {/* Action queue */}
      <div className="space-y-2 mb-5">
        <ActionRow
          action="Create ticket: Finalize pricing page copy"
          tool="Linear"
          status="pending"
        />
        <ActionRow
          action="Assign ticket: API docs update → Maya"
          tool="Linear"
          status="pending"
        />
        <ActionRow
          action="Post update to #product-team: Q2 roadmap decisions"
          tool="Slack"
          status="pending"
        />
      </div>

      {/* Decision detail */}
      <div className="rounded-xl border border-brand-line bg-brand-elevated p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Based on this decision
        </p>
        <p className="text-sm leading-6 text-foreground">
          &ldquo;Pricing page goes live end of April &mdash; Jordan owns copy, Maya owns the API
          reference update.&rdquo;
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Captured at 14:32 · Q2 planning meeting
        </p>
      </div>

      {/* Approve / reject */}
      <div className="mt-4 flex gap-2">
        <button
          className="flex-1 rounded-xl border border-brand-success/40 bg-brand-success-soft px-4 py-2.5 text-sm text-brand-success"
          type="button"
        >
          Approve all
        </button>
        <button
          className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground"
          type="button"
        >
          Review each
        </button>
      </div>
    </ProductWindow>
  )
}
