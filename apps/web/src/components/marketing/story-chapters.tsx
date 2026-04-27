import { Check } from 'lucide-react'
import { SectionShell } from './section-shell'
import { SectionEyebrow } from './section-eyebrow'
import { RevealOnScroll } from './reveal-on-scroll'
import {
  ProductWindow,
  MeetingHeader,
  ActionRow,
} from './product-frame'
import { storyChapters } from '@/content/marketing/homepage'

export function StoryChapters() {
  return (
    <SectionShell id="how-it-works" className="space-y-24 py-16 sm:py-20 lg:py-28">
      <div className="text-center">
        <SectionEyebrow className="mb-3">How Kodi works</SectionEyebrow>
        <h2 className="mx-auto max-w-2xl text-4xl tracking-[-0.05em] sm:text-5xl">
          One system for listening,<br className="hidden sm:block" /> thinking, and moving the work.
        </h2>
      </div>

      {storyChapters.map((chapter, index) => (
        <RevealOnScroll key={chapter.id}>
          <div
            className={`grid items-center gap-12 lg:grid-cols-2 ${
              index % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
            }`}
          >
            {/* Text */}
            <div className="reveal space-y-6">
              <SectionEyebrow variant="accent">{chapter.eyebrow}</SectionEyebrow>
              <h3 className="text-3xl tracking-[-0.045em] sm:text-4xl">
                {chapter.headline}
              </h3>
              <p className="text-base leading-8 text-muted-foreground">
                {chapter.body}
              </p>
              <ul className="space-y-3">
                {chapter.proofItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-brand-success"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual */}
            <div className="reveal">
              <ChapterVisual chapterId={chapter.id} />
            </div>
          </div>
        </RevealOnScroll>
      ))}
    </SectionShell>
  )
}

function ChapterVisual({ chapterId }: { chapterId: string }) {
  if (chapterId === 'during') {
    return (
      <ProductWindow>
        <MeetingHeader title="Product roadmap sync" participants={6} />
        <div className="space-y-2.5">
          <div className="rounded-xl border border-brand-line bg-brand-elevated p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Live question
            </p>
            <p className="mt-1 text-sm text-foreground">
              &ldquo;What&apos;s the status of the API migration?&rdquo;
            </p>
          </div>
          <div className="rounded-xl border border-brand-line bg-brand-elevated p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Kodi answered
            </p>
            <p className="mt-1 text-sm leading-6 text-foreground">
              &ldquo;The migration is 68% complete per the Linear milestone. 3 blockers remain &mdash; 2 are assigned to Maya, 1 is unassigned.&rdquo;
            </p>
            <span className="mt-2 inline-block rounded-full border border-brand-accent/30 bg-brand-accent-soft px-2 py-0.5 text-xs text-brand-accent-strong">
              from Linear
            </span>
          </div>
          <div className="rounded-xl border border-brand-line bg-brand-elevated p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Decision pinned
            </p>
            <p className="mt-1 text-sm text-foreground">
              &ldquo;Maya to take the unassigned blocker &mdash; target EOW&rdquo;
            </p>
          </div>
        </div>
      </ProductWindow>
    )
  }

  if (chapterId === 'after') {
    return (
      <ProductWindow>
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Meeting ended 2 minutes ago
          </p>
          <p className="mt-1 text-base tracking-[-0.03em]">
            Kodi is already handling the follow-through
          </p>
        </div>
        <div className="space-y-2">
          <ActionRow
            action="Send meeting recap to #product-team"
            tool="Slack"
            status="executed"
          />
          <ActionRow
            action="Create ticket: Assign API migration blocker to Maya"
            tool="Linear"
            status="approved"
          />
          <ActionRow
            action="Update Notion doc: API migration status"
            tool="Notion"
            status="pending"
          />
          <ActionRow
            action="Add follow-up to shared doc: Q2 decisions log"
            tool="Notion"
            status="drafting"
          />
        </div>
      </ProductWindow>
    )
  }

  /* between */
  return (
    <ProductWindow>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Autonomy settings
        </p>
        <p className="mt-1 text-base tracking-[-0.03em]">
          You choose how far Kodi goes
        </p>
      </div>
      <div className="space-y-3">
        {[
          { action: 'Send Slack messages', level: 'Executes directly', accent: true },
          { action: 'Create Linear tickets', level: 'Approval required', accent: false },
          { action: 'Update CRM records', level: 'Suggest only', accent: false },
          { action: 'Send external emails', level: 'Approval required', accent: false },
        ].map((row) => (
          <div
            key={row.action}
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-elevated px-4 py-3"
          >
            <p className="text-sm text-foreground">{row.action}</p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                row.accent
                  ? 'border-brand-success/30 bg-brand-success-soft text-brand-success'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {row.level}
            </span>
          </div>
        ))}
      </div>
    </ProductWindow>
  )
}
